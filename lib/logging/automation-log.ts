import type { LogLevel } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { appendLocalLog } from "@/lib/logging/local-file-log";

type WriteAutomationLogInput = {
  campaignId?: string | null;
  jobListingId?: string | null;
  applicationId?: string | null;
  level?: LogLevel;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export async function writeAutomationLog({
  campaignId,
  jobListingId,
  applicationId,
  level = "info",
  event,
  message,
  metadata,
}: WriteAutomationLogInput) {
  const localLogPromise = appendLocalLog({
    campaignId,
    jobListingId,
    applicationId,
    level,
    event,
    message,
    metadata,
  }).catch(() => undefined);

  try {
    const result = await prisma.automationLog.create({
      data: {
        campaignId: campaignId ?? null,
        jobListingId: jobListingId ?? null,
        level,
        event,
        message,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
      },
    });

    await localLogPromise;
    return result;
  } catch (error) {
    await localLogPromise;
    throw error;
  }
}
