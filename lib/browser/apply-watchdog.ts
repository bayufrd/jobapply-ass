import type { Page } from "playwright";
import { writeAutomationLog } from "@/lib/logging/automation-log";

export type ApplyWatchdogConfig = {
  maxSameStepDurationMs: number;
  maxSubmitResolverDurationMs: number;
  maxNoProgressActions: number;
  maxAiFallbackAttempts: number;
  maxScrollScanAttempts: number;
  maxTotalJobDurationMs: number;
};

export type PageSignature = {
  url: string;
  visibleFormFields: string[];
  visibleQuestions: string[];
  visibleButtons: string[];
  visibleSubmitCandidates: string[];
  visibleTextHash: string;
  scrollPosition: number;
};

export type WatchdogRuntimeStatus = {
  stepKey: string | null;
  stepLabel: string | null;
  stepStartedAt: string | null;
  stepElapsedSeconds: number;
  maxStepSeconds: number;
  noProgressCount: number;
  aiFallbackAttempts: number;
  nextAutomaticAction: string | null;
  lastProgressAt: string | null;
  totalJobElapsedSeconds: number;
};

const DEFAULT_WATCHDOG_CONFIG: ApplyWatchdogConfig = {
  maxSameStepDurationMs: Number(process.env.APPLY_MAX_SAME_STEP_DURATION_MS ?? 8000),
  maxSubmitResolverDurationMs: Number(process.env.APPLY_MAX_SUBMIT_RESOLVER_DURATION_MS ?? 8000),
  maxNoProgressActions: Number(process.env.APPLY_MAX_NO_PROGRESS_ACTIONS ?? 2),
  maxAiFallbackAttempts: Number(process.env.APPLY_MAX_AI_FALLBACK_ATTEMPTS ?? 1),
  maxScrollScanAttempts: Number(process.env.APPLY_MAX_SCROLL_SCAN_ATTEMPTS ?? 2),
  maxTotalJobDurationMs: Number(process.env.APPLY_MAX_TOTAL_JOB_DURATION_MS ?? 180000),
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return String(hash >>> 0);
}

function uniqueTop(values: string[], limit: number) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].slice(0, limit);
}

export function getApplyWatchdogConfig(overrides?: Partial<ApplyWatchdogConfig>): ApplyWatchdogConfig {
  return { ...DEFAULT_WATCHDOG_CONFIG, ...overrides };
}

export async function capturePageSignature(page: Page): Promise<PageSignature> {
  return page.evaluate(() => {
    const isVisible = (element: Element) => {
      const node = element as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 0
        && rect.height > 0
        && (node.offsetParent !== null || style.position === "fixed");
    };

    const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const collect = (selector: string, mapElement: (element: Element) => string | null, limit = 20) => {
      const items = Array.from(document.querySelectorAll(selector))
        .filter((element) => isVisible(element))
        .map(mapElement)
        .map((value) => normalize(value))
        .filter(Boolean);
      return [...new Set(items)].slice(0, limit);
    };

    const visibleFormFields = collect(
      "input, textarea, select",
      (element) => {
        const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        return [
          input.tagName.toLowerCase(),
          input.type || "",
          input.name || "",
          input.id || "",
          input.getAttribute("aria-label") || "",
          input.getAttribute("placeholder") || "",
        ].join("|");
      },
      40,
    );

    const visibleQuestions = collect(
      "label, legend, [role='heading'], h1, h2, h3, h4, h5, h6, p, span, div",
      (element) => {
        const text = normalize(element.textContent || "");
        if (!text) return null;
        if (text.length < 8 || text.length > 160) return null;
        if (!/[?？]/.test(text) && !/apakah|berapa|kapan|mengapa|why|what|how|experience|salary|notice|availability/i.test(text)) {
          return null;
        }
        return text;
      },
      25,
    );

    const visibleButtons = collect(
      "button, a[role='button'], input[type='button'], input[type='submit']",
      (element) => normalize(element.textContent || (element as HTMLInputElement).value || ""),
      30,
    );

    const visibleSubmitCandidates = visibleButtons.filter((text) => /submit|kirim|apply|lamar|send/i.test(text)).slice(0, 20);
    const bodyText = normalize(document.body?.innerText || "").slice(0, 4000);

    return {
      url: window.location.href,
      visibleFormFields,
      visibleQuestions,
      visibleButtons,
      visibleSubmitCandidates,
      visibleTextHash: bodyText,
      scrollPosition: Math.round(window.scrollY || 0),
    };
  }).then((result) => ({
    ...result,
    visibleFormFields: uniqueTop(result.visibleFormFields, 40),
    visibleQuestions: uniqueTop(result.visibleQuestions, 25),
    visibleButtons: uniqueTop(result.visibleButtons, 30),
    visibleSubmitCandidates: uniqueTop(result.visibleSubmitCandidates, 20),
    visibleTextHash: hashText(result.visibleTextHash),
  }));
}

export function isSamePageSignature(before: PageSignature | null, after: PageSignature | null) {
  if (!before || !after) return false;
  return JSON.stringify(before) === JSON.stringify(after);
}

export function createWatchdogRuntime(config: ApplyWatchdogConfig = getApplyWatchdogConfig()) {
  const totalStartedAt = Date.now();
  let stepKey: string | null = null;
  let stepLabel: string | null = null;
  let stepStartedAt: number | null = null;
  let lastProgressAt: number | null = totalStartedAt;
  let noProgressCount = 0;
  let aiFallbackAttempts = 0;
  let lastSignature: PageSignature | null = null;
  let nextAutomaticAction: string | null = null;

  const getStatus = (): WatchdogRuntimeStatus => ({
    stepKey,
    stepLabel,
    stepStartedAt: stepStartedAt ? new Date(stepStartedAt).toISOString() : null,
    stepElapsedSeconds: stepStartedAt ? Math.max(0, Math.floor((Date.now() - stepStartedAt) / 1000)) : 0,
    maxStepSeconds: Math.max(1, Math.ceil(config.maxSameStepDurationMs / 1000)),
    noProgressCount,
    aiFallbackAttempts,
    nextAutomaticAction,
    lastProgressAt: lastProgressAt ? new Date(lastProgressAt).toISOString() : null,
    totalJobElapsedSeconds: Math.max(0, Math.floor((Date.now() - totalStartedAt) / 1000)),
  });

  return {
    config,
    getStatus,
    startStep(step: { key: string; label: string; nextAutomaticAction?: string | null }) {
      if (stepKey !== step.key) {
        stepKey = step.key;
        stepLabel = step.label;
        stepStartedAt = Date.now();
        noProgressCount = 0;
      }
      nextAutomaticAction = step.nextAutomaticAction ?? nextAutomaticAction;
    },
    updateNextAutomaticAction(value: string | null) {
      nextAutomaticAction = value;
    },
    recordProgress(signature: PageSignature) {
      lastSignature = signature;
      noProgressCount = 0;
      lastProgressAt = Date.now();
      if (!stepStartedAt) {
        stepStartedAt = Date.now();
      }
    },
    recordNoProgress(signature: PageSignature) {
      lastSignature = signature;
      noProgressCount += 1;
    },
    getLastSignature() {
      return lastSignature;
    },
    shouldTriggerNoProgressFallback() {
      return noProgressCount >= config.maxNoProgressActions;
    },
    shouldTimeoutCurrentStep() {
      return stepStartedAt !== null && Date.now() - stepStartedAt >= config.maxSameStepDurationMs;
    },
    shouldTimeoutJob() {
      return Date.now() - totalStartedAt >= config.maxTotalJobDurationMs;
    },
    canUseAiFallback() {
      return aiFallbackAttempts < config.maxAiFallbackAttempts;
    },
    markAiFallbackStarted() {
      aiFallbackAttempts += 1;
      nextAutomaticAction = "AI fallback dicoba satu kali.";
    },
  };
}

export async function logWatchdogEvent(params: {
  campaignId: string;
  jobListingId?: string | null;
  level?: "info" | "warn" | "error";
  event:
    | "application.step_timer_started"
    | "application.step_timeout"
    | "application.no_progress_detected"
    | "application.no_progress_limit_reached"
    | "application.ai_fallback_once_started"
    | "application.ai_fallback_once_failed"
    | "application.submit_resolver_timeout"
    | "application.job_stuck_skipped"
    | "campaign.autopilot_continue_after_stuck";
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await writeAutomationLog({
    campaignId: params.campaignId,
    jobListingId: params.jobListingId ?? null,
    level: params.level,
    event: params.event,
    message: params.message,
    metadata: params.metadata,
  });
}
