import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { PlaywrightMcpClient } from "@/lib/mcp/playwright-mcp-client";
import { analyzeJobstreetSessionSnapshot } from "@/lib/jobstreet/session-check";
import { jsonError, jsonOk } from "@/lib/api/json-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaignId = id;

  try {
    const { otp } = (await request.json()) as { otp: string };

    if (!otp || otp.length < 6) {
      return jsonError("otp_invalid", "OTP harus 6 digit.", undefined, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return jsonError("campaign_not_found", "Kampanye tidak ditemukan.", undefined, { status: 404 });
    }

    await writeAutomationLog({
      campaignId,
      event: "auth.otp_submitted",
      message: "User mensubmit OTP melalui aplikasi.",
      metadata: {
        otpLength: otp.length,
        otpMasked: otp.slice(0, 1) + "****" + otp.slice(-1),
      },
    });

    const client = new PlaywrightMcpClient();
    await client.connect();
    
    let snapshot = await client.snapshot();
    
    // Find OTP input
    const otpElement = snapshot.elements.find((element) => {
      if (element.disabled) return false;
      const role = String(element.role ?? "").toLowerCase();
      const name = String(element.name ?? "").toLowerCase();
      const text = String(element.text ?? "").toLowerCase();
      const combined = `${name} ${text}`;
      return (
        role.includes("textbox") && 
        (combined.includes("code") || combined.includes("otp") || combined.includes("verification") || combined.includes("verifikasi"))
      );
    });

    if (!otpElement) {
      await writeAutomationLog({
        campaignId,
        level: "error",
        event: "auth.otp_field_not_found",
        message: "Field input OTP tidak ditemukan di browser.",
      });
      return jsonError("otp_field_not_found", "Field input OTP tidak ditemukan di browser. Cek browser visible.");
    }

    await client.fill(otpElement.elementId, otp);
    
    // Find continue button - usually has text like 'Continue', 'Verify', 'Submit', 'Next'
    const continueButton = snapshot.elements.find((element) => {
      const role = String(element.role ?? "").toLowerCase();
      const name = String(element.name ?? "").toLowerCase();
      const text = String(element.text ?? "").toLowerCase();
      const combined = `${name} ${text}`;
      return (
        (role.includes("button") || role.includes("link")) &&
        (combined.includes("continue") || combined.includes("verify") || combined.includes("submit") || combined.includes("next") || combined.includes("verifikasi") || combined.includes("lanjut"))
      );
    });

    if (continueButton) {
      await client.click(continueButton.elementId);
    } else {
      // Sometimes just pressing Enter works if there's no obvious button
      await client.fill(otpElement.elementId, otp + "\n");
    }

    // Wait for changes
    await new Promise((resolve) => setTimeout(resolve, 3000));
    snapshot = await client.snapshot();
    const result = analyzeJobstreetSessionSnapshot(snapshot);

    if (result.state === "authenticated") {
      await writeAutomationLog({
        campaignId,
        event: "auth.login_verified",
        message: "Login Jobstreet berhasil diverifikasi setelah OTP.",
        metadata: {
          currentUrl: result.currentUrl,
        },
      });

      return jsonOk({
        message: "OTP berhasil dikirim dan login diverifikasi.",
        state: result.state,
      });
    } else {
      await writeAutomationLog({
        campaignId,
        level: "warn",
        event: "auth.otp_verification_failed",
        message: "OTP sudah dikirim tetapi belum terverifikasi login. Cek browser.",
        metadata: {
          state: result.state,
          currentUrl: result.currentUrl,
        },
      });

      return jsonOk({
        message: "OTP sudah dikirim tetapi status belum terverifikasi. Cek browser visible.",
        state: result.state,
      });
    }
  } catch (error) {
    return jsonError(
      "otp_submission_failed",
      error instanceof Error ? error.message : "Gagal mengirim OTP.",
      undefined,
      { status: 500 },
    );
  }
}
