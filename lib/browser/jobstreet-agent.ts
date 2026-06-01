import { closeManagedBrowser, launchManagedBrowser } from "@/lib/browser/playwright-manager";
import { detectManualIntervention } from "@/lib/browser/page-detector";
import { fillKnownApplicationFields } from "@/lib/browser/form-filler";
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

export async function runJobstreetCampaign(input: StartCampaignInput) {
  const session = await launchManagedBrowser();

  try {
    await writeAutomationLog({
      campaignId: input.campaignId,
      event: "browser.launch",
      message: "Visible Chromium launched for campaign.",
      metadata: { keyword: input.keyword, location: input.location ?? null },
    });

    await session.page.goto("https://www.jobstreet.co.id/", { waitUntil: "domcontentloaded" });

    const detection = await detectManualIntervention(session.page);
    if (detection.detected && detection.reason) {
      await writeAutomationLog({
        campaignId: input.campaignId,
        level: "warn",
        event: "manual_intervention",
        message: buildInterventionMessage(detection.reason),
        metadata: { details: detection.details ?? null },
      });

      return requiresManualIntervention(detection.reason);
    }

    await writeAutomationLog({
      campaignId: input.campaignId,
      event: "jobstreet.ready",
      message: "Jobstreet opened in visible mode. Manual login may still be required.",
    });

    await fillKnownApplicationFields(session.page, input.profile, input.defaults);

    await writeAutomationLog({
      campaignId: input.campaignId,
      level: "warn",
      event: "submit.review_required",
      message: "Automation stub reached the review boundary. Final submit is blocked pending explicit user approval.",
    });

    return requiresManualIntervention("submit_review");
  } catch (error) {
    await writeAutomationLog({
      campaignId: input.campaignId,
      level: "error",
      event: "campaign.error",
      message: error instanceof Error ? error.message : "Unknown automation error.",
    });

    throw error;
  } finally {
    await closeManagedBrowser(session);
  }
}
