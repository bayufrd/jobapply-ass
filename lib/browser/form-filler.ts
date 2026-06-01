import type { Page } from "playwright";
import { requiresManualIntervention } from "@/lib/security/safe-automation";

type CandidateProfileInput = {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
};

type CampaignDefaultsInput = {
  currentSalary?: number | null;
  expectedSalary?: number | null;
  noticePeriod?: string | null;
  availability?: string | null;
};

export async function fillKnownApplicationFields(
  page: Page,
  profile: CandidateProfileInput,
  defaults: CampaignDefaultsInput,
) {
  const knownValues: Array<[string, string]> = [
    ["input[name*='name']", profile.fullName ?? ""],
    ["input[type='email']", profile.email ?? ""],
    ["input[type='tel']", profile.phone ?? ""],
    ["input[name*='location']", profile.location ?? ""],
    ["input[name*='current']", defaults.currentSalary ? String(defaults.currentSalary) : ""],
    ["input[name*='expected']", defaults.expectedSalary ? String(defaults.expectedSalary) : ""],
    ["input[name*='notice']", defaults.noticePeriod ?? ""],
    ["input[name*='availability']", defaults.availability ?? ""],
  ];

  for (const [selector, value] of knownValues) {
    if (!value) continue;
    const field = page.locator(selector).first();
    if ((await field.count()) > 0) {
      await field.fill(value);
    }
  }
}

export function handleUnknownField() {
  return requiresManualIntervention("unknown_question");
}
