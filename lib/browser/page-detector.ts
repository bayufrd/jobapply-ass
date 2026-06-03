import type { Page } from "playwright";
import type { InterventionReason } from "../security/safe-automation.ts";
import { detectJobstreetApplyStep, isNormalJobstreetApplyUrl } from "./jobstreet-apply-step-detector.ts";

export type ManualInterventionType =
  | "login"
  | "captcha"
  | "otp"
  | "security_verification"
  | "permission_dialog"
  | "unknown";

export type DetectionResult = {
  detected: boolean;
  type: ManualInterventionType;
  confidence: number;
  reason: string;
  evidence: string[];
  reasonCode?: InterventionReason;
  details?: string;
};

export type VisiblePageSignals = {
  visibleText: string;
  interactiveTexts: string[];
  hasVisiblePasswordInput: boolean;
  hasVisibleOtpInput: boolean;
  hasVisibleCaptcha: boolean;
  hasVisibleLoginButton: boolean;
};

async function collectVisibleSignals(page: Page): Promise<VisiblePageSignals> {
  return page
    .evaluate(() => {
      const isVisible = (element: Element | null) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const textFrom = (element: Element | null) => (element?.textContent || "").replace(/\s+/g, " ").trim();
      const visibleElements = Array.from(document.querySelectorAll("body *")).filter((element) => isVisible(element));
      const visibleText = visibleElements.map((element) => textFrom(element)).filter(Boolean).join(" ").toLowerCase();

      const interactiveTexts = visibleElements
        .filter((element) => {
          if (!(element instanceof HTMLElement)) return false;
          const tag = element.tagName.toLowerCase();
          return tag === "button" || tag === "a" || tag === "label" || element.getAttribute("role") === "button";
        })
        .map((element) => textFrom(element).toLowerCase())
        .filter(Boolean)
        .slice(0, 200);

      const inputs = visibleElements.filter((element) => element instanceof HTMLInputElement) as HTMLInputElement[];
      const hasVisiblePasswordInput = inputs.some((input) => input.type === "password");
      const hasVisibleOtpInput = inputs.some((input) => {
        const joined = [input.name, input.id, input.placeholder, input.getAttribute("aria-label")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return input.type === "tel" || input.type === "number" || /otp|verification|code|kode/.test(joined);
      });

      const hasVisibleCaptcha = visibleElements.some((element) => {
        const tag = element.tagName.toLowerCase();
        const joined = [
          textFrom(element),
          element.getAttribute("title") || "",
          element.getAttribute("aria-label") || "",
          element.getAttribute("src") || "",
          element.getAttribute("name") || "",
          element.getAttribute("id") || "",
          element.className || "",
        ]
          .join(" ")
          .toLowerCase();
        return tag === "iframe"
          ? /captcha|recaptcha|hcaptcha|cloudflare/i.test(joined)
          : /captcha|i'm not a robot|robot check/.test(joined);
      });

      const hasVisibleLoginButton = interactiveTexts.some((text) =>
        /(login|log in|sign in|masuk|continue with email|masuk dengan email)/.test(text),
      );

      return {
        visibleText,
        interactiveTexts,
        hasVisiblePasswordInput,
        hasVisibleOtpInput,
        hasVisibleCaptcha,
        hasVisibleLoginButton,
      };
    })
    .catch(() => ({
      visibleText: "",
      interactiveTexts: [],
      hasVisiblePasswordInput: false,
      hasVisibleOtpInput: false,
      hasVisibleCaptcha: false,
      hasVisibleLoginButton: false,
    }));
}

function buildResult(input: {
  detected: boolean;
  type?: ManualInterventionType;
  confidence?: number;
  reason?: string;
  evidence?: string[];
  reasonCode?: InterventionReason;
}): DetectionResult {
  return {
    detected: input.detected,
    type: input.type ?? "unknown",
    confidence: input.confidence ?? 0,
    reason: input.reason ?? "Tidak ada intervensi manual yang terlihat.",
    evidence: input.evidence ?? [],
    reasonCode: input.reasonCode,
    details: (input.evidence ?? []).join(" | ") || (input.reason ?? undefined),
  };
}

export function shouldPauseForManualIntervention(result: DetectionResult) {
  return result.detected && result.confidence >= 0.85;
}

export function detectManualInterventionFromSignals(rawUrl: string, signals: VisiblePageSignals): DetectionResult {
  const url = rawUrl.toLowerCase();

  if (!url || url === "about:blank") {
    return buildResult({ detected: false });
  }

  const visibleText = signals.visibleText;
  const evidence: string[] = [];
  const step = detectJobstreetApplyStep(rawUrl, visibleText);
  const normalJobstreetApplyUrl = isNormalJobstreetApplyUrl(rawUrl);

  if (/\/oauth\/login(?:$|[/?#])/.test(url) || /(^|\s)(sign in to your account|log in to your account|masuk ke akun)(\s|$)/.test(visibleText)) {
    evidence.push("Halaman login terlihat.");
  }
  if (signals.hasVisiblePasswordInput) {
    evidence.push("Input password terlihat.");
  }
  if (signals.hasVisibleLoginButton) {
    evidence.push("Tombol login terlihat.");
  }

  if (evidence.length > 0 && (signals.hasVisiblePasswordInput || /\/oauth\/login(?:$|[/?#])/.test(url))) {
    return buildResult({
      detected: true,
      type: "login",
      confidence: 0.98,
      reason: "Login Jobstreet terlihat dan membutuhkan tindakan manual.",
      evidence,
      reasonCode: "manual_login_required",
    });
  }

  const otpEvidence: string[] = [];
  if (signals.hasVisibleOtpInput) otpEvidence.push("Input OTP atau kode verifikasi terlihat.");
  if (/verification code|enter verification code|kode verifikasi|otp|one-time password/.test(visibleText)) {
    otpEvidence.push("Teks OTP atau kode verifikasi terlihat.");
  }
  if (otpEvidence.length >= 2 || (otpEvidence.length >= 1 && /\/oauth\//.test(url))) {
    return buildResult({
      detected: true,
      type: "otp",
      confidence: 0.96,
      reason: "OTP atau kode verifikasi terlihat dan membutuhkan tindakan manual.",
      evidence: otpEvidence,
      reasonCode: "otp",
    });
  }

  const captchaEvidence: string[] = [];
  if (signals.hasVisibleCaptcha) captchaEvidence.push("Captcha terlihat pada halaman.");
  if (/captcha|i'm not a robot|verify you are human|robot check/.test(visibleText)) {
    captchaEvidence.push("Teks captcha atau verifikasi manusia terlihat.");
  }
  if (captchaEvidence.length > 0) {
    return buildResult({
      detected: true,
      type: "captcha",
      confidence: 0.99,
      reason: "Captcha terlihat dan membutuhkan tindakan manual.",
      evidence: captchaEvidence,
      reasonCode: "captcha",
    });
  }

  const securityEvidence: string[] = [];
  if (/verify your identity|verify your account|account verification|security check|unusual activity|session expired|sesi berakhir|verifikasi identitas|verifikasi akun|aktivitas tidak biasa/.test(visibleText)) {
    securityEvidence.push("Teks verifikasi keamanan atau akun terlihat.");
  }
  if (/allow notifications|izinkan notifikasi|allow location|izinkan lokasi|browser permission/.test(visibleText)) {
    return buildResult({
      detected: true,
      type: "permission_dialog",
      confidence: 0.9,
      reason: "Dialog izin browser terlihat dan membutuhkan tindakan manual.",
      evidence: ["Dialog izin browser terlihat."],
      reasonCode: "uncertain_action",
    });
  }
  if (securityEvidence.length > 0) {
    return buildResult({
      detected: true,
      type: "security_verification",
      confidence: 0.93,
      reason: "Verifikasi keamanan terlihat dan membutuhkan tindakan manual.",
      evidence: securityEvidence,
      reasonCode: "security_check",
    });
  }

  if (normalJobstreetApplyUrl && (step === "profile" || step === "review" || step === "apply" || step === "role-requirements" || step === "success")) {
    return buildResult({
      detected: false,
      type: "unknown",
      confidence: 0.05,
      reason: "URL langkah Jobstreet normal terdeteksi tanpa bukti kuat login atau verifikasi.",
      evidence: [],
    });
  }

  if (!url.includes("jobstreet") && !url.includes("jobsdb")) {
    return buildResult({
      detected: true,
      type: "unknown",
      confidence: 0.86,
      reason: "Halaman berpindah ke domain tak terduga dan perlu review manual.",
      evidence: [`Domain saat ini: ${rawUrl}`],
      reasonCode: "uncertain_page",
    });
  }

  return buildResult({
    detected: false,
    type: "unknown",
    confidence: 0.1,
    reason: "Tidak ada bukti kuat login, captcha, OTP, atau verifikasi keamanan.",
    evidence: [],
  });
}

export async function detectManualIntervention(page: Page): Promise<DetectionResult> {
  const rawUrl = page.url();
  const signals = await collectVisibleSignals(page);
  return detectManualInterventionFromSignals(rawUrl, signals);
}
