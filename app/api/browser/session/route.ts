import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { PlaywrightMcpClient, type McpSnapshot } from "@/lib/mcp/playwright-mcp-client";
import {
  analyzeJobstreetSessionSnapshot,
  getDefaultJobstreetSessionCheckUrl,
} from "@/lib/jobstreet/session-check";

const SAFE_JOBSTREET_EMAIL = "bayu.farid36@gmail.com";

function findVisibleEmailElement(snapshot: McpSnapshot) {
  return snapshot.elements.find((element) => {
    if (element.disabled) return false;
    const role = String(element.role ?? "").toLowerCase();
    const name = String(element.name ?? "").toLowerCase();
    const text = String(element.text ?? "").toLowerCase();
    const value = String(element.value ?? "").toLowerCase();
    const combined = `${name} ${text} ${value}`;
    const looksEmailField = combined.includes("email")
      || combined.includes("e-mail")
      || combined.includes("username")
      || combined.includes("user name")
      || combined.includes("jobstreet email")
      || combined.includes("alamat email");
    return role.includes("textbox") && looksEmailField;
  }) ?? null;
}

async function settleJobstreetSession(input: {
  client: PlaywrightMcpClient;
  campaignId: string | null;
  targetUrl: string;
  applyTargetUrl: string;
  recoverBlank: boolean;
  skipNavigate?: boolean;
}) {
  const { client, campaignId, targetUrl, applyTargetUrl, recoverBlank, skipNavigate } = input;

  if (!skipNavigate) {
    await client.navigate(applyTargetUrl || targetUrl);
  }
  let snapshot = await client.snapshot();
  let result = analyzeJobstreetSessionSnapshot(snapshot);
  let lastActionableResult = result.state === "unknown" ? null : result;
  let recoveryAttempted = false;
  let emailFillAttempted = false;
  let emailFillCompleted = false;
  let settleAttempts = 0;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    settleAttempts = attempt;

    if (recoverBlank && !skipNavigate && result.state === "unknown" && String(result.currentUrl || "").trim().toLowerCase() === "about:blank") {
      recoveryAttempted = true;

      await writeAutomationLog({
        campaignId,
        event: "mcp.resume_blank_snapshot_detected",
        message: "Snapshot session check berada di about:blank. Recovery navigate ke target apply URL dijalankan.",
        metadata: {
          attempt,
          targetUrl,
          applyTargetUrl,
          diagnostics: client.getSessionDiagnostics(),
          initialResult: result,
        },
      }).catch(() => undefined);

      await client.navigate(applyTargetUrl);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      snapshot = await client.snapshot();
      result = analyzeJobstreetSessionSnapshot(snapshot);
      if (result.state !== "unknown") {
        lastActionableResult = result;
      }
      continue;
    }

    if (result.state === "email_required") {
      const emailElement = findVisibleEmailElement(snapshot);
      if (emailElement && !emailFillCompleted) {
        emailFillAttempted = true;

        await writeAutomationLog({
          campaignId,
          event: "jobstreet.login_email_fill_started",
          message: "Field email login Jobstreet terlihat. Sistem mengisi email aman tanpa menyentuh password/OTP.",
          metadata: {
            currentUrl: result.currentUrl,
            elementId: emailElement.elementId,
          },
        }).catch(() => undefined);

        await client.fill(emailElement.elementId, SAFE_JOBSTREET_EMAIL);
        emailFillCompleted = true;

        await writeAutomationLog({
          campaignId,
          event: "jobstreet.login_email_fill_done",
          message: "Email login Jobstreet berhasil diisi. Browser visible tetap menunggu langkah manual user.",
          metadata: {
            currentUrl: result.currentUrl,
          },
        }).catch(() => undefined);

        snapshot = await client.waitForChange(snapshot, 2500);
        result = analyzeJobstreetSessionSnapshot(snapshot);
      }
    }

    if ((result.state !== "unknown" && !(result.state === "email_required" && emailFillCompleted && attempt < 3)) || attempt === 3) {
      break;
    }

    snapshot = await client.waitForChange(snapshot, 2500);
    result = analyzeJobstreetSessionSnapshot(snapshot);
    if (result.state !== "unknown") {
      lastActionableResult = result;
    }
  }

  if (result.state === "unknown" && lastActionableResult) {
    result = {
      ...lastActionableResult,
      evidence: [...lastActionableResult.evidence, "Snapshot akhir kembali tidak stabil, tetapi state non-blank terakhir dipertahankan sebagai blocker yang lebih kuat."],
    };
  }

  return {
    snapshot,
    result,
    recoveryAttempted,
    emailFillAttempted,
    emailFillCompleted,
    settleAttempts,
  };
}

export async function GET(request: Request) {
  const session = await prisma.browserSession.findUnique({
    where: { provider: "jobstreet" },
  });

  const { searchParams } = new URL(request.url);
  const shouldCheckLive = searchParams.get("checkLive") === "1";
  const campaignId = searchParams.get("campaignId");
  const targetUrl = searchParams.get("targetUrl") || getDefaultJobstreetSessionCheckUrl();
  const applyTargetUrl = searchParams.get("applyTargetUrl") || targetUrl;
  const recoverBlank = searchParams.get("recoverBlank") === "1";
  const skipNavigate = searchParams.get("skipNavigate") === "1";
  const visibleMode = (process.env.PLAYWRIGHT_HEADLESS ?? "false") !== "true";

  let liveCheck: Record<string, unknown> | null = null;

  if (shouldCheckLive) {
    await writeAutomationLog({
      campaignId,
      event: "jobstreet.session_check_started",
      message: "Validasi sesi Jobstreet live via MCP dimulai.",
      metadata: {
        targetUrl,
        visibleMode,
        skipNavigate,
      },
    }).catch(() => undefined);

    try {
      const client = new PlaywrightMcpClient();
      await client.connect();
      const settled = await settleJobstreetSession({
        client,
        campaignId,
        targetUrl,
        applyTargetUrl,
        recoverBlank,
        skipNavigate,
      });

      liveCheck = {
        ok: true,
        targetUrl,
        applyTargetUrl,
        recoverBlank,
        skipNavigate,
        recoveryAttempted: settled.recoveryAttempted,
        emailFillAttempted: settled.emailFillAttempted,
        emailFillCompleted: settled.emailFillCompleted,
        settleAttempts: settled.settleAttempts,
        mcpUrl: client.getMcpUrl(),
        diagnostics: client.getSessionDiagnostics(),
        ...settled.result,
      };

      await writeAutomationLog({
        campaignId,
        level: settled.result.canResumeAutopilot ? "info" : "warn",
        event: settled.result.canResumeAutopilot ? "jobstreet.session_valid" : "jobstreet.session_invalid",
        message: settled.result.canResumeAutopilot
          ? "Sesi Jobstreet live valid untuk melanjutkan autopilot."
          : "Sesi Jobstreet live belum valid untuk melanjutkan autopilot.",
        metadata: liveCheck,
      }).catch(() => undefined);
    } catch (error) {
      liveCheck = {
        ok: false,
        targetUrl,
        error: error instanceof Error ? error.message : "Live session check gagal.",
      };

      await writeAutomationLog({
        campaignId,
        level: "warn",
        event: "jobstreet.session_invalid",
        message: "Validasi sesi Jobstreet live via MCP gagal dijalankan.",
        metadata: liveCheck,
      }).catch(() => undefined);
    }
  }

  return NextResponse.json({
    session,
    configuredPath: process.env.PLAYWRIGHT_SESSION_PATH ?? "./storage/jobstreet.auth.json",
    visibleMode,
    liveCheck,
    message: shouldCheckLive
      ? "Validasi sesi browser Jobstreet live selesai."
      : session
        ? "Metadata sesi browser ditemukan. Tambahkan ?checkLive=1 untuk validasi live via MCP."
        : "Belum ada metadata sesi browser tersimpan. Tambahkan ?checkLive=1 untuk validasi live via MCP.",
  });
}
