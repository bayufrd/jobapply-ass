import { prisma } from "@/lib/db/prisma";
import { writeAutomationLog } from "@/lib/logging/automation-log";

export async function getCampaignOrThrow(id: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id } });

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  return campaign;
}

export async function setCampaignStatus(id: string, status: "running" | "paused" | "stopped" | "completed" | "error") {
  return prisma.campaign.update({
    where: { id },
    data: { status },
  });
}

export async function logCampaignEvent(campaignId: string, event: string, message: string) {
  await writeAutomationLog({
    campaignId,
    event,
    message,
  });
}
