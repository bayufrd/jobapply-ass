import { NextResponse } from "next/server";
import { getCampaignOrThrow, logCampaignEvent, setCampaignStatus } from "@/lib/api/campaigns";
import { runCampaignAutopilot } from "@/lib/campaign/autopilot-runner";
import { prisma } from "@/lib/db/prisma";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    await getCampaignOrThrow(id);
    const profile = await prisma.candidateProfile.findFirst({ orderBy: { updatedAt: "desc" } });

    if (!profile) {
      return NextResponse.json(
        { error: "Belum ada profil kandidat. Jalankan analisis CV terlebih dahulu." },
        { status: 400 },
      );
    }

    await setCampaignStatus(id, "running");
    await logCampaignEvent(id, "campaign.start", "Kampanye ditandai berjalan dan autopilot akan dijalankan.");

    const result = await runCampaignAutopilot(id);

    if (result.status === "completed") {
      await setCampaignStatus(id, "completed");
      await logCampaignEvent(id, "campaign.completed", result.message);
    } else if (
      result.status === "manual_intervention_required"
      || result.status === "question_required"
      || result.status === "submit_unverified"
      || result.status === "review_required"
      || result.status === "paused"
      || result.status === "decision_required"
    ) {
      await setCampaignStatus(id, "paused");
      await logCampaignEvent(id, "campaign.paused", result.message);
    } else if (result.status === "error") {
      await setCampaignStatus(id, "error");
      await logCampaignEvent(id, "campaign.error", result.message);
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      result,
      message: result.message,
    });
  } catch (error) {
    await setCampaignStatus(id, "error");
    await logCampaignEvent(
      id,
      "campaign.error",
      error instanceof Error ? error.message : "Gagal memulai kampanye.",
    );

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memulai kampanye." },
      { status: 500 },
    );
  }
}
