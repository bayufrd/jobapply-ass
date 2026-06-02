export function canStartAutopilot(status: string): boolean {
  return ["ready", "paused", "stopped", "error"].includes(status);
}

export function canContinueAutopilot(status: string): boolean {
  return ["running", "paused"].includes(status);
}

export function isCampaignTerminal(status: string): boolean {
  return ["completed"].includes(status);
}
