import { NextResponse } from "next/server";
import { runJobstreetCampaign } from "@/lib/browser/jobstreet-agent";
import { getCampaignOrThrow, logCampaignEvent, setCampaignStatus } from "@/lib/api/campaigns";
import { prisma } from "@/lib/db/prisma";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const campaign = await getCampaignOrThrow(id);
    const profile = await prisma.candidateProfile.findFirst({ orderBy: { updatedAt: "desc" } });

    if (!profile) {
      return NextResponse.json(
        { error: "Belum ada profil kandidat. Jalankan analisis CV terlebih dahulu." },
        { status: 400 },
      );
    }

    await setCampaignStatus(id, "running");
    await logCampaignEvent(id, "campaign.start", "Kampanye ditandai berjalan dan browser akan dibuka.");

    const result = await runJobstreetCampaign({
      campaignId: id,
      keyword: campaign.keyword,
      location: campaign.location,
      targetApplyCount: campaign.targetApplyCount,
      matchThreshold: campaign.matchThreshold,
      profile: {
        fullName: profile.fullName ?? undefined,
        email: profile.email ?? undefined,
        phone: profile.phone ?? undefined,
        location: profile.location ?? undefined,
      },
      defaults: {
        currentSalary: campaign.defaultCurrentSalary,
        expectedSalary: campaign.defaultExpectedSalary,
        noticePeriod: campaign.defaultNoticePeriod,
        availability: campaign.defaultAvailability,
      },
    });

    // Set campaign status based on result
    if (result.status === "completed") {
      await setCampaignStatus(id, "completed");
      await logCampaignEvent(
        id,
        "campaign.completed",
        `Pencarian selesai. ${result.jobsSaved} lowongan berhasil disimpan dari ${result.jobsFound} yang ditemukan.`,
      );
    } else if (result.status === "manual_intervention") {
      await setCampaignStatus(id, "paused");
      await logCampaignEvent(id, "campaign.paused", "Kampanye dijeda karena intervensi manual diperlukan.");
    } else if (result.status === "search_failed") {
      await setCampaignStatus(id, "error");
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
