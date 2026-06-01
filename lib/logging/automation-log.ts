import type { LogLevel } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type WriteAutomationLogInput = {
  campaignId?: string | null;
  jobListingId?: string | null;
  level?: LogLevel;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export async function writeAutomationLog({
  campaignId,
  jobListingId,
  level = "info",
  event,
  message,
  metadata,
}: WriteAutomationLogInput) {
  return prisma.automationLog.create({
    data: {
      campaignId: campaignId ?? null,
      jobListingId: jobListingId ?? null,
      level,
      event,
      message,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    },
  });
}
