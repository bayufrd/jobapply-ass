import { NextResponse } from "next/server";
import { logCampaignEvent, setCampaignStatus } from "@/lib/api/campaigns";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = await setCampaignStatus(id, "running");
  await logCampaignEvent(
    id,
    "campaign.resume",
    "Kampanye ditandai berjalan kembali. Resume automation penuh belum diimplementasikan.",
  );
  return NextResponse.json({
    success: true,
    campaign,
    message: "Status kampanye diubah ke running, tetapi resume automation penuh belum diimplementasikan.",
  });
}
