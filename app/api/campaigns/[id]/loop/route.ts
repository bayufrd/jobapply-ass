import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { prepareNextApplication } from "@/lib/campaign/loop-runner";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { setCampaignStatus } from "@/lib/api/campaigns";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Load campaign
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json(
        { error: "Kampanye tidak ditemukan." },
        { status: 404 },
      );
    }

    // Set campaign to running if paused or draft
    if (campaign.status === "paused" || campaign.status === "draft" || campaign.status === "ready") {
      await setCampaignStatus(id, "running");
    } else if (campaign.status !== "running") {
      return NextResponse.json(
        { error: `Kampanye tidak dapat dilanjutkan. Status: ${campaign.status}` },
        { status: 400 },
      );
    }

    // Log loop started
    await writeAutomationLog({
      campaignId: id,
      event: "campaign.loop_started",
      message: `Loop kampanye dimulai. Target: ${campaign.targetApplyCount}, Terkirim: ${campaign.appliedCount}.`,
      metadata: {
        targetApplyCount: campaign.targetApplyCount,
        appliedCount: campaign.appliedCount,
      },
    });

    // Check if target already reached
    if (campaign.appliedCount >= campaign.targetApplyCount) {
      await setCampaignStatus(id, "completed");
      await writeAutomationLog({
        campaignId: id,
        event: "campaign.target_reached",
        message: `Target lamaran sudah tercapai: ${campaign.appliedCount}/${campaign.targetApplyCount}.`,
      });

      return NextResponse.json({
        status: "target_reached",
        message: `Target lamaran sudah tercapai (${campaign.appliedCount}/${campaign.targetApplyCount}).`,
      });
    }

    // Prepare next application
    const result = await prepareNextApplication(id);

    if (result.status === "target_reached") {
      await setCampaignStatus(id, "completed");
    } else if (result.status === "no_jobs") {
      // No more jobs to process, but target not reached
      await writeAutomationLog({
        campaignId: id,
        event: "campaign.loop_paused",
        message: "Loop dijeda: tidak ada lowongan shortlisted tersedia. Jalankan pencarian lagi atau tunggu user menyetujui lamaran yang ada.",
      });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error in campaign loop:", error);
    return NextResponse.json(
      {
        error: "Terjadi kesalahan saat menjalankan loop kampanye.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
