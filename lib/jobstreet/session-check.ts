import type { McpSnapshot } from "@/lib/mcp/playwright-mcp-client";

export type JobstreetSessionState = "authenticated" | "login_required" | "security_or_challenge" | "unknown";

export type JobstreetSessionCheckResult = {
  state: JobstreetSessionState;
  currentUrl: string | null;
  evidence: string[];
  confidence: number;
  visibleBrowserRequired: boolean;
  canResumeAutopilot: boolean;
  loginUrlDetected: boolean;
  passwordInputDetected: boolean;
  applyUrlDetected: boolean;
  snapshotPreview: string;
};

const JOBSTREET_DIRECT_QA_URL = "https://id.jobstreet.com/id/job/92457600";

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").toLowerCase();
}

function hasAny(text: string, markers: string[]) {
  return markers.some((marker) => text.includes(marker));
}

export function getDefaultJobstreetSessionCheckUrl() {
  return JOBSTREET_DIRECT_QA_URL;
}

export function analyzeJobstreetSessionSnapshot(snapshot: McpSnapshot): JobstreetSessionCheckResult {
  const currentUrl = snapshot.url ?? null;
  const url = normalizeText(snapshot.url);
  const title = normalizeText(snapshot.title);
  const text = normalizeText(`${snapshot.accessibilityText}\n${snapshot.rawText}`);
  const elementText = normalizeText(
    snapshot.elements
      .map((element) => `${element.role ?? ""} ${element.name ?? ""} ${element.text ?? ""}`)
      .join("\n"),
  );
  const combined = `${url}\n${title}\n${text}\n${elementText}`;
  const snapshotPreview = `${snapshot.title}\n${snapshot.accessibilityText}`.trim().slice(0, 1200);

  const loginUrlDetected = hasAny(combined, ["/oauth/login", "/id/oauth/login", "returnurl="]);
  const passwordInputDetected = snapshot.elements.some((element) => {
    const role = normalizeText(element.role);
    const name = normalizeText(element.name);
    const textValue = normalizeText(element.text);
    return role.includes("textbox") && (name.includes("password") || textValue.includes("password"));
  }) || hasAny(combined, ["password", "kata sandi"]);
  const otpDetected = hasAny(combined, ["verification code", "kode verifikasi", "one-time password", "otp"]);
  const captchaDetected = hasAny(combined, ["captcha", "i'm not a robot", "saya bukan robot"]);
  const securityDetected = hasAny(combined, ["security verification", "verify it is you", "verifikasi keamanan"]);
  const applyUrlDetected = /\/id\/job\/\d+\/apply(?:[/?#]|$)/.test(url);
  const jobDetailDetected = /\/id\/job\/\d+(?:[/?#]|$)/.test(url) || url.includes("/id/job/92457600");

  if (applyUrlDetected) {
    return {
      state: "authenticated",
      currentUrl,
      evidence: ["URL apply internal Jobstreet terdeteksi pada snapshot MCP."],
      confidence: 0.99,
      visibleBrowserRequired: false,
      canResumeAutopilot: true,
      loginUrlDetected,
      passwordInputDetected,
      applyUrlDetected,
      snapshotPreview,
    };
  }

  if (captchaDetected || otpDetected || securityDetected) {
    const evidence = [];
    if (captchaDetected) evidence.push("Sinyal captcha terlihat pada snapshot MCP.");
    if (otpDetected) evidence.push("Sinyal OTP/kode verifikasi terlihat pada snapshot MCP.");
    if (securityDetected) evidence.push("Sinyal verifikasi keamanan terlihat pada snapshot MCP.");
    return {
      state: "security_or_challenge",
      currentUrl,
      evidence,
      confidence: 0.98,
      visibleBrowserRequired: true,
      canResumeAutopilot: false,
      loginUrlDetected,
      passwordInputDetected,
      applyUrlDetected,
      snapshotPreview,
    };
  }

  if (loginUrlDetected || passwordInputDetected) {
    return {
      state: "login_required",
      currentUrl,
      evidence: ["Halaman login atau URL oauth/login terlihat pada snapshot MCP."],
      confidence: 0.98,
      visibleBrowserRequired: true,
      canResumeAutopilot: false,
      loginUrlDetected,
      passwordInputDetected,
      applyUrlDetected,
      snapshotPreview,
    };
  }

  if (jobDetailDetected) {
    return {
      state: "authenticated",
      currentUrl,
      evidence: ["Snapshot MCP berada di halaman detail lowongan Jobstreet tanpa sinyal login kuat."],
      confidence: 0.7,
      visibleBrowserRequired: false,
      canResumeAutopilot: true,
      loginUrlDetected,
      passwordInputDetected,
      applyUrlDetected,
      snapshotPreview,
    };
  }

  return {
    state: "unknown",
    currentUrl,
    evidence: ["Snapshot MCP belum cukup kuat untuk membuktikan sesi Jobstreet valid atau invalid."],
    confidence: 0.4,
    visibleBrowserRequired: true,
    canResumeAutopilot: false,
    loginUrlDetected,
    passwordInputDetected,
    applyUrlDetected,
    snapshotPreview,
  };
}
