import type { Page } from "playwright";

export type ApplyWizardState =
  | "job_detail"
  | "apply_button_visible"
  | "application_form"
  | "question_step"
  | "review_step"
  | "final_submit_ready"
  | "submitted_success"
  | "manual_intervention"
  | "external_redirect"
  | "stuck"
  | "unknown";

export type ApplyWizardSnapshot = {
  state: ApplyWizardState;
  url: string;
  title: string;
  visibleText: string;
  hasApplyButton: boolean;
  hasForm: boolean;
  hasQuestionSignals: boolean;
  hasReviewSignals: boolean;
  hasFinalSubmitSignals: boolean;
  hasSuccessSignals: boolean;
  isExternalRedirect: boolean;
  interactiveCount: number;
  fingerprint: string;
  reason: string;
};

const APPLY_BUTTON_PATTERNS = [
  "quick apply",
  "apply now",
  "lamar sekarang",
  "easy apply",
  "apply",
  "lamar",
];

const QUESTION_PATTERNS = [
  "why are you",
  "why do you",
  "years of experience",
  "pengalaman",
  "gaji",
  "salary",
  "expected salary",
  "notice period",
  "availability",
  "relokasi",
  "authorization",
  "visa",
  "cover letter",
  "portfolio",
  "question",
  "pertanyaan",
  "please answer",
];

const REVIEW_PATTERNS = [
  "review your application",
  "review application",
  "application review",
  "ringkasan lamaran",
  "tinjau lamaran",
  "review",
  "resume",
  "cv",
];

const FINAL_SUBMIT_PATTERNS = [
  "submit application",
  "kirim lamaran",
  "send application",
  "application submitted",
];

const CONTINUE_PATTERNS = [
  "continue",
  "next",
  "selanjutnya",
  "lanjut",
  "review",
  "continue application",
];

const SUCCESS_PATTERNS = [
  "application submitted",
  "your application has been submitted",
  "your application has been sent",
  "lamaran terkirim",
  "lamaran berhasil dikirim",
  "anda telah melamar",
  "application received",
  "thank you for applying",
  "terima kasih telah melamar",
];

function normalize(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

async function collectWizardSignals(page: Page) {
  return page.evaluate(
    ({ applyPatterns, questionPatterns, reviewPatterns, finalSubmitPatterns, continuePatterns }) => {
      const selectors = [
        "button",
        "a[role='button']",
        "input[type='submit']",
        "input[type='button']",
        "input:not([type='hidden'])",
        "textarea",
        "select",
        "[contenteditable='true']",
      ].join(", ");

      const normalizeInner = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

      const isVisible = (node: Element) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && style.opacity !== "0"
          && rect.width > 0
          && rect.height > 0
          && !node.hasAttribute("hidden")
          && node.getAttribute("aria-hidden") !== "true";
      };

      const visibleNodes = Array.from(document.querySelectorAll(selectors)).filter(isVisible);
      const visibleButtons = visibleNodes.filter((node) => {
        const tag = node.tagName.toLowerCase();
        return tag === "button"
          || node.getAttribute("role") === "button"
          || (tag === "input" && ["submit", "button"].includes((node.getAttribute("type") ?? "").toLowerCase()));
      });

      const buttonTexts = visibleButtons
        .map((node) => normalizeInner(node.textContent || (node as HTMLInputElement).value || node.getAttribute("aria-label") || ""))
        .filter(Boolean);

      const visibleText = normalizeInner(document.body?.innerText || "");
      const hasApplyButton = buttonTexts.some((text) => applyPatterns.some((pattern: string) => text.includes(pattern)));
      const hasContinueSignals = buttonTexts.some((text) => continuePatterns.some((pattern: string) => text === pattern || text.includes(pattern)));
      const hasFinalSubmitSignals = buttonTexts.some((text) => finalSubmitPatterns.some((pattern: string) => text === pattern || text.includes(pattern)));
      const hasQuestionSignals = questionPatterns.some((pattern: string) => visibleText.includes(pattern));
      const hasReviewSignals = reviewPatterns.some((pattern: string) => visibleText.includes(pattern));
      const hasForm = Array.from(document.querySelectorAll("form, input:not([type='hidden']), textarea, select"))
        .filter(isVisible)
        .length > 0;

      return {
        visibleText,
        hasApplyButton,
        hasContinueSignals,
        hasFinalSubmitSignals,
        hasQuestionSignals,
        hasReviewSignals,
        hasForm,
        interactiveCount: visibleNodes.length,
      };
    },
    {
      applyPatterns: APPLY_BUTTON_PATTERNS,
      questionPatterns: QUESTION_PATTERNS,
      reviewPatterns: REVIEW_PATTERNS,
      finalSubmitPatterns: FINAL_SUBMIT_PATTERNS,
      continuePatterns: CONTINUE_PATTERNS,
    },
  );
}

export async function detectApplyWizardState(page: Page): Promise<ApplyWizardSnapshot> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const signals = await collectWizardSignals(page);
  const visibleText = normalize(signals.visibleText);
  const isExternalRedirect = !url.toLowerCase().includes("jobstreet") && !url.toLowerCase().includes("jobsdb");
  const hasSuccessSignals = includesAny(visibleText, SUCCESS_PATTERNS);

  let state: ApplyWizardState = "unknown";
  let reason = "Tidak ada pola state yang cukup kuat.";

  if (hasSuccessSignals) {
    state = "submitted_success";
    reason = "Marker sukses submit terlihat pada halaman.";
  } else if (isExternalRedirect) {
    state = "external_redirect";
    reason = `Domain di luar Jobstreet/JobsDB terdeteksi: ${url}`;
  } else if (includesAny(visibleText, ["captcha", "otp", "verification", "security check", "login", "sign in"])) {
    state = "manual_intervention";
    reason = "Marker login/verifikasi manual terlihat pada halaman.";
  } else if (signals.hasFinalSubmitSignals && (signals.hasReviewSignals || signals.hasForm) && !signals.hasContinueSignals) {
    state = "final_submit_ready";
    reason = "Tombol submit final terlihat pada halaman review/form.";
  } else if (signals.hasContinueSignals && signals.hasForm) {
    state = "application_form";
    reason = "Form aplikasi masih berada pada langkah lanjut, belum final submit.";
  } else if (signals.hasQuestionSignals && signals.hasForm) {
    state = "question_step";
    reason = "Form berisi marker pertanyaan tambahan.";
  } else if (signals.hasReviewSignals && signals.hasForm) {
    state = "review_step";
    reason = "Marker review/summary terlihat pada form.";
  } else if (signals.hasForm) {
    state = "application_form";
    reason = "Form aplikasi terlihat dan siap diisi.";
  } else if (signals.hasApplyButton) {
    state = "apply_button_visible";
    reason = "Tombol apply terlihat pada halaman job detail.";
  } else if (url.toLowerCase().includes("jobstreet") || url.toLowerCase().includes("jobsdb")) {
    state = "job_detail";
    reason = "Masih berada di domain lowongan internal tanpa form/apply yang jelas.";
  }

  const fingerprint = JSON.stringify({
    url,
    title,
    state,
    interactiveCount: signals.interactiveCount,
    text: visibleText.slice(0, 800),
  });

  return {
    state,
    url,
    title,
    visibleText,
    hasApplyButton: signals.hasApplyButton,
    hasForm: signals.hasForm,
    hasQuestionSignals: signals.hasQuestionSignals,
    hasReviewSignals: signals.hasReviewSignals,
    hasFinalSubmitSignals: signals.hasFinalSubmitSignals,
    hasSuccessSignals,
    isExternalRedirect,
    interactiveCount: signals.interactiveCount,
    fingerprint,
    reason,
  };
}

export function hasWizardProgress(previous: ApplyWizardSnapshot | null, current: ApplyWizardSnapshot) {
  if (!previous) return true;
  return previous.fingerprint !== current.fingerprint || previous.state !== current.state || previous.url !== current.url;
}
