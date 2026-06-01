import { NextResponse } from "next/server";
import { logCampaignEvent, setCampaignStatus } from "@/lib/api/campaigns";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = await setCampaignStatus(id, "running");
  await logCampaignEvent(id, "campaign.resume", "Campaign resumed by user request.");
  return NextResponse.json({ success: true, campaign });
}
