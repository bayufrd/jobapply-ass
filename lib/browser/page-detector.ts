import type { Page } from "playwright";
import type { InterventionReason } from "@/lib/security/safe-automation";

type DetectionResult = {
  detected: boolean;
  reason?: InterventionReason;
  details?: string;
};

export async function detectManualIntervention(page: Page): Promise<DetectionResult> {
  const content = (await page.content()).toLowerCase();
  const url = page.url().toLowerCase();

  if (content.includes("captcha") || content.includes("i'm not a robot") || url.includes("captcha")) {
    return { detected: true, reason: "captcha", details: "Captcha markers found on page." };
  }

  if (
    content.includes("one-time password") ||
    content.includes("otp") ||
    content.includes("verification code") ||
    content.includes("email verification") ||
    content.includes("phone verification")
  ) {
    return { detected: true, reason: "otp", details: "Verification challenge detected." };
  }

  if (
    content.includes("suspicious") ||
    content.includes("security check") ||
    content.includes("unusual activity")
  ) {
    return { detected: true, reason: "security_check", details: "Security review page detected." };
  }

  if (!url.includes("jobstreet") && !url.includes("jobsdb")) {
    return { detected: true, reason: "uncertain_page", details: `Unexpected domain: ${page.url()}` };
  }

  return { detected: false };
}
