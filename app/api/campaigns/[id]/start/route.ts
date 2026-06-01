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

    await setCampaignStatus(id, "paused");

    if (result.status === "not_implemented") {
      return NextResponse.json({
        success: true,
        status: "partial",
        result,
        message: result.message,
      });
    }

    return NextResponse.json({
      success: true,
      status: "paused",
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
