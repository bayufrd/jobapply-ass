import { mkdir } from "node:fs/promises";
import path from "node:path";
import { closeManagedBrowser, launchManagedBrowser } from "@/lib/browser/playwright-manager";
import { detectManualIntervention } from "@/lib/browser/page-detector";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { buildInterventionMessage, requiresManualIntervention } from "@/lib/security/safe-automation";

type StartCampaignInput = {
  campaignId: string;
  keyword: string;
  location?: string | null;
  profile: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
  };
  defaults: {
    currentSalary?: number | null;
    expectedSalary?: number | null;
    noticePeriod?: string | null;
    availability?: string | null;
  };
};

type CampaignRunResult = {
  paused: boolean;
  reason?: string;
  message: string;
  status: "manual_intervention" | "not_implemented";
  screenshotPath?: string;
};

async function ensureScreenshotDir() {
  const dir = path.join(process.cwd(), "storage", "screenshots");
  await mkdir(dir, { recursive: true });
  return dir;
}

async function saveErrorScreenshot(campaignId: string, page: Awaited<ReturnType<typeof launchManagedBrowser>>["page"]) {
  const dir = await ensureScreenshotDir();
  const filePath = path.join(dir, `${Date.now()}-${campaignId}-error.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return `./storage/screenshots/${path.basename(filePath)}`;
}

export async function runJobstreetCampaign(input: StartCampaignInput): Promise<CampaignRunResult> {
  const session = await launchManagedBrowser();

  try {
    await writeAutomationLog({
      campaignId: input.campaignId,
      event: "browser.launch",
      message: "Browser Chromium visible berhasil dibuka untuk kampanye.",
      metadata: { keyword: input.keyword, location: input.location ?? null },
    });

    await session.page.goto("https://www.jobstreet.co.id/", { waitUntil: "domcontentloaded" });

    await writeAutomationLog({
      campaignId: input.campaignId,
      event: "jobstreet.ready",
      message: "Homepage Jobstreet berhasil dibuka di browser visible.",
    });

    const detection = await detectManualIntervention(session.page);
    if (detection.detected && detection.reason) {
      const message = buildInterventionMessage(detection.reason);

      await writeAutomationLog({
        campaignId: input.campaignId,
        level: "warn",
        event: "manual_intervention",
        message,
        metadata: { details: detection.details ?? null },
      });

      const manualState = requiresManualIntervention(detection.reason);
      return {
        paused: manualState.paused,
        reason: manualState.reason,
        message: manualState.message,
        status: "manual_intervention",
      };
    }

    const notImplementedMessage =
      "Browser berhasil dibuka, tetapi pencarian Jobstreet belum diimplementasikan.";

    await writeAutomationLog({
      campaignId: input.campaignId,
      level: "warn",
      event: "manual_intervention",
      message: notImplementedMessage,
      metadata: {
        stage: "jobstreet_search",
        implemented: false,
      },
    });

    return {
      paused: true,
      reason: "manual_login_required",
      message: notImplementedMessage,
      status: "not_implemented",
    };
  } catch (error) {
    let screenshotPath: string | undefined;

    try {
      screenshotPath = await saveErrorScreenshot(input.campaignId, session.page);
    } catch {
      screenshotPath = undefined;
    }

    await writeAutomationLog({
      campaignId: input.campaignId,
      level: "error",
      event: "campaign.error",
      message: error instanceof Error ? error.message : "Unknown automation error.",
      metadata: {
        screenshotPath: screenshotPath ?? null,
      },
    });

    throw error;
  } finally {
    await closeManagedBrowser(session);
  }
}
