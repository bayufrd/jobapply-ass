import { NextResponse } from "next/server";
import { logCampaignEvent, setCampaignStatus } from "@/lib/api/campaigns";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = await setCampaignStatus(id, "stopped");
  await logCampaignEvent(id, "campaign.stop", "Kampanye dihentikan oleh permintaan user.");
  return NextResponse.json({ success: true, campaign, message: "Kampanye berhasil dihentikan." });
}
