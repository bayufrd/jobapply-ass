export function canStartAutopilot(status: string): boolean {
  return ["ready", "paused", "stopped", "error"].includes(status);
}

export function canContinueAutopilot(status: string): boolean {
  return ["running", "paused"].includes(status);
}

export function isCampaignTerminal(status: string): boolean {
  return ["completed"].includes(status);
}

export const TERMINAL_CAMPAIGN_STEPS = [
  "no_jobs_remaining",
  "no_jobs_remaining_after_all_pages",
  "target_reached",
  "too_many_empty_pages",
  "too_many_unusable_jobs",
] as const;

export function isTerminalCampaignStep(step: string | null | undefined): boolean {
  return TERMINAL_CAMPAIGN_STEPS.includes(step as (typeof TERMINAL_CAMPAIGN_STEPS)[number]);
}
