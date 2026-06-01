import { NextResponse } from "next/server";
import { runJobstreetCampaign } from "@/lib/browser/jobstreet-agent";
import { getCampaignOrThrow, logCampaignEvent, setCampaignStatus } from "@/lib/api/campaigns";
import { prisma } from "@/lib/db/prisma";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const campaign = await getCampaignOrThrow(id);
    const profile = await prisma.candidateProfile.findFirst({ orderBy: { updatedAt: "desc" } });

    if (!profile) {
      return NextResponse.json({ error: "No candidate profile available. Analyze a CV first." }, { status: 400 });
    }

    await setCampaignStatus(id, "running");
    await logCampaignEvent(id, "campaign.start", "Campaign marked as running.");

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
    await logCampaignEvent(id, "campaign.paused", "Campaign paused for required human oversight.");

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const { id } = await context.params;
    await setCampaignStatus(id, "error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start campaign." },
      { status: 500 },
    );
  }
}
