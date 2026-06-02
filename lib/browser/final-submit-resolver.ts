import type { Locator, Page } from "playwright";

const ALLOWED_SUBMIT_LABELS = [
  "submit application",
  "kirim lamaran",
  "send application",
  "submit",
  "apply now",
  "kirim",
];

const BLOCKED_SUBMIT_LABELS = [
  "search",
  "cari",
  "simpan",
  "save",
  "bookmark",
  "selanjutnya",
  "next",
  "lanjut",
  "continue",
  "review",
  "back",
  "kembali",
  "cancel",
  "batal",
  "close",
  "tutup",
  "upload",
  "hapus",
  "delete",
];

const CONTAINER_HINTS = [
  "review",
  "application",
  "apply",
  "lamaran",
  "resume",
  "cover letter",
  "curriculum vitae",
  "cv",
  "submit",
  "jobstreet",
  "stay safe",
  "software engineer",
];

const ROOT_SELECTORS = [
  "form",
  "main",
  "[role='main']",
  "[role='dialog']",
  "[role='form']",
  "section",
  "article",
  "body",
];

const BUTTON_SELECTORS = [
  "button",
  "button[type='submit']",
  "input[type='submit']",
  "input[type='button']",
  "a[role='button']",
  "[data-automation*='submit' i]",
  "[data-testid*='submit' i]",
  "[aria-label*='submit' i]",
  "[aria-label*='lamaran' i]",
  "[aria-label*='apply' i]",
];

export type FinalSubmitResolverContext = {
  title?: string | null;
  company?: string | null;
  expectedLabels?: string[];
  reviewKeywords?: string[];
};

export type FinalSubmitCandidate = {
  locator: string;
  text: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  rootSelector?: string;
  score: number;
};

export type FinalSubmitResolution = {
  candidate: FinalSubmitCandidate | null;
  scannedCandidates: FinalSubmitCandidate[];
  pageSummary: {
    url: string;
    title: string;
    bodyPreview: string;
    scrollAttempts: number;
  };
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isAllowedLabel(text: string, expectedLabels: string[]) {
  return expectedLabels.some((label) => text === label || text.includes(label));
}

function isBlockedLabel(text: string) {
  return BLOCKED_SUBMIT_LABELS.some((label) => text.includes(label));
}

async function safeText(locator: Locator) {
  return normalizeText(((await locator.textContent().catch(() => null)) ?? (await locator.getAttribute("value").catch(() => null))));
}

async function collectVisibleCandidates(page: Page, expectedLabels: string[], reviewKeywords: string[]) {
  const candidates: FinalSubmitCandidate[] = [];

  for (const rootSelector of ROOT_SELECTORS) {
    for (const buttonSelector of BUTTON_SELECTORS) {
      const scopedSelector = rootSelector === "body" ? buttonSelector : `${rootSelector} ${buttonSelector}`;
      const elements = page.locator(scopedSelector);
      const count = await elements.count().catch(() => 0);

      for (let index = 0; index < Math.min(count, 25); index += 1) {
        const element = elements.nth(index);
        try {
          if (!(await element.isVisible()) || (await element.isDisabled())) {
            continue;
          }

          const text = await safeText(element);
          if (!text || !isAllowedLabel(text, expectedLabels) || isBlockedLabel(text)) {
            continue;
          }

          const metadata = await element
            .evaluate((node) => {
              const elementNode = node as HTMLElement;
              const rect = elementNode.getBoundingClientRect();
              const root = node.closest("form, main, section, article, [role='dialog'], [role='form']") as HTMLElement | null;
              const rootText = (root?.textContent || "").toLowerCase();
              const ariaLabel = (elementNode.getAttribute("aria-label") || "").toLowerCase();
              const automation = [
                elementNode.getAttribute("data-automation") || "",
                elementNode.getAttribute("data-testid") || "",
                elementNode.getAttribute("name") || "",
                elementNode.getAttribute("id") || "",
                elementNode.className || "",
              ]
                .join(" ")
                .toLowerCase();

              return {
                rootText,
                ariaLabel,
                automation,
                inViewport: rect.top < window.innerHeight && rect.bottom > 0,
                nearBottom: rect.top > window.innerHeight * 0.45,
              };
            })
            .catch(() => ({ rootText: "", ariaLabel: "", automation: "", inViewport: false, nearBottom: false }));

          let score = 0;
          if (text === "submit application" || text === "kirim lamaran") score += 6;
          else if (text.includes("submit application") || text.includes("kirim lamaran")) score += 5;
          else if (text === "submit" || text === "kirim") score += 3;
          else score += 2;

          if (metadata.inViewport) score += 2;
          if (metadata.nearBottom) score += 1;
          if (reviewKeywords.some((keyword) => metadata.rootText.includes(keyword))) score += 3;
          if (reviewKeywords.some((keyword) => metadata.automation.includes(keyword) || metadata.ariaLabel.includes(keyword))) score += 2;
          if (metadata.rootText.includes("stay safe")) score -= 1;

          const confidence = score >= 8 ? "high" : score >= 5 ? "medium" : "low";
          candidates.push({
            locator: scopedSelector,
            text,
            confidence,
            reason: `score=${score}; root=${rootSelector}; viewport=${metadata.inViewport}; hints=${reviewKeywords.filter((keyword) => metadata.rootText.includes(keyword)).join(",") || "none"}`,
            rootSelector,
            score,
          });
        } catch {
          // ignore candidate read errors
        }
      }
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .filter((candidate, index, all) => all.findIndex((item) => item.locator === candidate.locator && item.text === candidate.text) === index)
    .slice(0, 12);
}

async function progressiveScroll(page: Page) {
  let scrollAttempts = 0;
  for (let step = 0; step < 5; step += 1) {
    const before = await page.evaluate(() => window.scrollY).catch(() => 0);
    await page.mouse.wheel(0, 900).catch(() => undefined);
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => window.scrollY).catch(() => before);
    scrollAttempts += 1;
    if (after <= before) {
      break;
    }
  }
  return scrollAttempts;
}

export async function resolveFinalSubmitButton(page: Page, context: FinalSubmitResolverContext = {}): Promise<FinalSubmitResolution> {
  const expectedLabels = [...ALLOWED_SUBMIT_LABELS, ...(context.expectedLabels ?? []).map(normalizeText)].filter(Boolean);
  const reviewKeywords = [
    ...CONTAINER_HINTS,
    normalizeText(context.title),
    normalizeText(context.company),
    ...((context.reviewKeywords ?? []).map(normalizeText)),
  ].filter(Boolean);

  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(1200);

  let scannedCandidates = await collectVisibleCandidates(page, expectedLabels, reviewKeywords);
  let scrollAttempts = 0;

  if (scannedCandidates.length === 0 || scannedCandidates[0]?.confidence !== "high") {
    scrollAttempts = await progressiveScroll(page);
    scannedCandidates = await collectVisibleCandidates(page, expectedLabels, reviewKeywords);
  }

  const candidate = scannedCandidates[0] ?? null;
  const title = await page.title().catch(() => "");
  const bodyPreview = normalizeText((await page.textContent("body").catch(() => ""))?.slice(0, 4000));

  return {
    candidate,
    scannedCandidates,
    pageSummary: {
      url: page.url(),
      title,
      bodyPreview,
      scrollAttempts,
    },
  };
}

export async function clickResolvedFinalSubmit(page: Page, candidate: FinalSubmitCandidate) {
  const locator = page
    .locator(candidate.locator)
    .filter({ hasText: new RegExp(escapeRegex(candidate.text), "i") })
    .first();

  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(300);
  await locator.click({ timeout: 10_000 });
}
