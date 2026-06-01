export const SAFE_AUTOMATION_NOTICES = {
  noCaptchaBypass: "Captcha bypass is forbidden. Pause and wait for the user to solve it manually.",
  noStealth: "Stealth evasion and anti-detection behavior are forbidden.",
  noProxyRotation: "Proxy rotation and anti-detection traffic shaping are forbidden.",
  visibleBrowserOnly: "The browser must run in visible non-headless mode.",
  humanOversight:
    "If the system is uncertain, missing information, or sees verification/security challenges, it must pause and ask the user.",
  explicitSubmitApproval: "Final submission must only happen after explicit user approval.",
} as const;

export type InterventionReason =
  | "captcha"
  | "otp"
  | "security_check"
  | "unknown_question"
  | "missing_information"
  | "manual_login_required"
  | "submit_review"
  | "uncertain_page"
  | "uncertain_action";

export function requiresManualIntervention(reason: InterventionReason) {
  return {
    paused: true,
    reason,
    message: buildInterventionMessage(reason),
  };
}

export function buildInterventionMessage(reason: InterventionReason) {
  switch (reason) {
    case "captcha":
      return "Captcha detected. Pause automation and wait for the user to solve it manually in the visible browser.";
    case "otp":
      return "OTP or verification challenge detected. Wait for user action before continuing.";
    case "security_check":
      return "Security or suspicious login page detected. Manual review is required.";
    case "unknown_question":
      return "Unknown or ambiguous application question detected. Ask the user before continuing.";
    case "missing_information":
      return "Required information is missing. Pause and request user input.";
    case "manual_login_required":
      return "Saved session unavailable or invalid. Let the user log in manually if credentials are unavailable or verification is required.";
    case "submit_review":
      return "Application review required. Submission can only continue after explicit user approval.";
    case "uncertain_page":
      return "Unexpected or unclear page detected. Pause for user review.";
    case "uncertain_action":
      return "Automation confidence is too low. Pause and ask the user what to do next.";
    default:
      return SAFE_AUTOMATION_NOTICES.humanOversight;
  }
}
