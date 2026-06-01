import type { Page } from "playwright";
import { launchManagedBrowser } from "@/lib/browser/playwright-manager";
import { detectManualIntervention } from "@/lib/browser/page-detector";
import { prisma } from "@/lib/db/prisma";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

type FlowType =
  | "jobstreet_internal"
  | "external_redirect"
  | "email_apply"
  | "whatsapp_apply"
  | "unknown";

type Platform =
  | "jobstreet"
  | "google_form"
  | "greenhouse"
  | "lever"
  | "workday"
  | "company_site"
  | "unknown";

export type DetectedButton = {
  text: string;
  tag: string;
  type: string;
  disabled: boolean;
};

export type DetectedInput = {
  label: string;
  placeholder: string;
  name: string;
  type: string;
  required: boolean;
  visible: boolean;
};

export type DetectedTextarea = {
  label: string;
  placeholder: string;
  name: string;
  required: boolean;
};

export type DetectedSelect = {
  label: string;
  name: string;
  optionCount: number;
  required: boolean;
};

export type DetectedQuestion = {
  text: string;
  source: string;
};

export type SubmitCandidate = {
  text: string;
  tag: string;
  type: string;
  selector: string;
};

export type FormSnapshot = {
  currentUrl: string;
  pageTitle: string;
  flowType: FlowType;
  platform: Platform;
  detectedButtons: DetectedButton[];
  detectedInputs: DetectedInput[];
  detectedTextareas: DetectedTextarea[];
  detectedSelects: DetectedSelect[];
  detectedQuestions: DetectedQuestion[];
  submitButtonCandidates: SubmitCandidate[];
  finalSubmitRisk: "low" | "medium" | "high";
  screenshotPath: string | null;
};

export type CalibrationResult = {
  status: "calibrated" | "manual_intervention" | "failed";
  message: string;
  calibrationId?: string;
  flowType?: FlowType;
  platform?: Platform;
  screenshotPath?: string | null;
  error?: string;
};

// ── Constants ──────────────────────────────────────────────────────────

const APPLY_BUTTON_TEXTS = [
  "lamar",
  "lamar sekarang",
  "apply",
  "apply now",
  "submit application",
];

const APPLY_HREF_PATTERNS = ["apply", "lamar"];

const APPLY_DATA_ATTRS = [
  "[data-automation*='apply' i]",
  "[data-automation*='job-detail-apply' i]",
  "[data-automation*='jobapply' i]",
  "[data-testid*='apply' i]",
];

const SUBMIT_LABELS = [
  "kirim",
  "submit",
  "submit application",
  "kirim lamaran",
  "lamar sekarang",
  "apply",
  "apply now",
];

const BLOCKED_LABELS = [
  "search",
  "cari",
  "simpan",
  "save",
  "bookmark",
  "selanjutnya",
  "next",
  "lanjut",
  "back",
  "kembali",
  "cancel",
  "batal",
];

// ── Helpers ────────────────────────────────────────────────────────────

async function saveCalibrationScreenshot(
  page: Page,
  label: string,
  calibrationId: string,
): Promise<string | null> {
  try {
    const screenshotDir = path.join(process.cwd(), "storage", "screenshots");
    await mkdir(screenshotDir, { recursive: true });
    const fileName = `calibration-${calibrationId}-${label}-${Date.now()}.png`;
    const filePath = path.join(screenshotDir, fileName);
    await page.screenshot({ path: filePath, fullPage: true });
    return `./storage/screenshots/${fileName}`;
  } catch {
    return null;
  }
}

function classifyFlowType(url: string, hasFormFields: boolean): FlowType {
  const lowerUrl = url.toLowerCase();

  if (
    lowerUrl.startsWith("mailto:") ||
    lowerUrl.includes("mailto:")
  ) {
    return "email_apply";
  }

  if (
    lowerUrl.includes("wa.me") ||
    lowerUrl.includes("whatsapp") ||
    lowerUrl.includes("api.whatsapp")
  ) {
    return "whatsapp_apply";
  }

  if (
    lowerUrl.includes("jobstreet.com") ||
    lowerUrl.includes("jobsdb.com") ||
    lowerUrl.includes("id.jobstreet")
  ) {
    if (hasFormFields) {
      return "jobstreet_internal";
    }
    // Still on jobstreet domain but no form yet - might be internal
    return "jobstreet_internal";
  }

  // URL left jobstreet domain
  if (!lowerUrl.includes("jobstreet") && !lowerUrl.includes("jobsdb")) {
    return "external_redirect";
  }

  return "unknown";
}

function classifyPlatform(url: string, pageContent: string): Platform {
  const lowerUrl = url.toLowerCase();
  const lowerContent = pageContent.toLowerCase();

  if (
    lowerUrl.includes("jobstreet.com") ||
    lowerUrl.includes("jobsdb.com") ||
    lowerUrl.includes("id.jobstreet")
  ) {
    return "jobstreet";
  }

  if (
    lowerUrl.includes("docs.google.com/forms") ||
    lowerContent.includes("google forms") ||
    lowerContent.includes("google form")
  ) {
    return "google_form";
  }

  if (
    lowerUrl.includes("greenhouse.io") ||
    lowerUrl.includes("boards.greenhouse") ||
    lowerUrl.includes("greenhouse") ||
    lowerContent.includes("greenhouse")
  ) {
    return "greenhouse";
  }

  if (
    lowerUrl.includes("lever.co") ||
    lowerUrl.includes("jobs.lever") ||
    lowerContent.includes("lever")
  ) {
    return "lever";
  }

  if (
    lowerUrl.includes("workday.com") ||
    lowerUrl.includes("myworkdayjobs") ||
    lowerContent.includes("workday")
  ) {
    return "workday";
  }

  if (!lowerUrl.includes("jobstreet") && !lowerUrl.includes("jobsdb")) {
    return "company_site";
  }

  return "unknown";
}

// ── Apply Button Detection (enhanced, detection-only) ──────────────────

type ApplyButtonMatch = {
  found: boolean;
  strategy: string;
  selector: string;
};

async function detectApplyButton(page: Page): Promise<ApplyButtonMatch> {
  // Strategy 1: getByRole button with text match
  for (const text of APPLY_BUTTON_TEXTS) {
    try {
      const btn = page.getByRole("button", { name: new RegExp(text, "i") }).first();
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        return { found: true, strategy: "role-button-text", selector: `getByRole("button", { name: /${text}/i })` };
      }
    } catch {
      // Continue
    }
  }

  // Strategy 2: getByRole link with text match
  for (const text of APPLY_BUTTON_TEXTS) {
    try {
      const link = page.getByRole("link", { name: new RegExp(text, "i") }).first();
      if ((await link.count()) > 0 && (await link.isVisible())) {
        return { found: true, strategy: "role-link-text", selector: `getByRole("link", { name: /${text}/i })` };
      }
    } catch {
      // Continue
    }
  }

  // Strategy 3: CSS text-based button/link
  const textSelectors = [
    "button:has-text('Lamar')",
    "button:has-text('Apply')",
    "button:has-text('Apply now')",
    "button:has-text('Lamar sekarang')",
    "a:has-text('Lamar')",
    "a:has-text('Apply')",
    "a:has-text('Apply now')",
    "a:has-text('Lamar sekarang')",
  ];

  for (const selector of textSelectors) {
    try {
      const el = page.locator(selector).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        return { found: true, strategy: "css-text", selector };
      }
    } catch {
      // Continue
    }
  }

  // Strategy 4: href containing apply/lamar
  for (const pattern of APPLY_HREF_PATTERNS) {
    try {
      const el = page.locator(`a[href*='${pattern}' i]`).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        return { found: true, strategy: "href-pattern", selector: `a[href*='${pattern}' i]` };
      }
    } catch {
      // Continue
    }
  }

  // Strategy 5: data-automation attributes
  for (const selector of APPLY_DATA_ATTRS) {
    try {
      const el = page.locator(selector).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        return { found: true, strategy: "data-automation", selector };
      }
    } catch {
      // Continue
    }
  }

  // Strategy 6: Generic fallback - scan buttons for apply-like text
  try {
    const buttons = page.locator("button, a[role='button'], a[href]");
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 30); i++) {
      const btn = buttons.nth(i);
      try {
        if (await btn.isVisible()) {
          const text = (await btn.textContent())?.toLowerCase().trim() ?? "";
          if (text.includes("lamar") || text.includes("apply")) {
            return { found: true, strategy: "generic-scan", selector: `button/a scan index ${i}` };
          }
        }
      } catch {
        // Continue
      }
    }
  } catch {
    // Continue
  }

  return { found: false, strategy: "none", selector: "" };
}

// ── Form Snapshot ──────────────────────────────────────────────────────

async function snapshotForm(page: Page, screenshotPath: string | null): Promise<FormSnapshot> {
  const currentUrl = page.url();
  const pageTitle = await page.title();

  // Detect buttons
  const detectedButtons: DetectedButton[] = [];
  try {
    const buttons = page.locator("button, input[type='submit'], input[type='button'], a[role='button']");
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 50); i++) {
      const btn = buttons.nth(i);
      try {
        if (await btn.isVisible()) {
          const tag = await btn.evaluate((el) => el.tagName.toLowerCase());
          const text = (await btn.textContent())?.trim() ?? "";
          const type = (await btn.getAttribute("type")) ?? "";
          const disabled = await btn.isDisabled();
          if (text.length > 0 || type === "submit") {
            detectedButtons.push({ text: text.substring(0, 200), tag, type, disabled });
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Continue
  }

  // Detect inputs
  const detectedInputs: DetectedInput[] = [];
  try {
    const inputs = page.locator("input:not([type='hidden']):not([type='submit']):not([type='button'])");
    const count = await inputs.count();
    for (let i = 0; i < Math.min(count, 50); i++) {
      const input = inputs.nth(i);
      try {
        const visible = await input.isVisible();
        const name = (await input.getAttribute("name")) ?? "";
        const type = (await input.getAttribute("type")) ?? "text";
        const placeholder = (await input.getAttribute("placeholder")) ?? "";
        const required = (await input.getAttribute("required")) !== null;
        const ariaLabel = (await input.getAttribute("aria-label")) ?? "";
        const label = ariaLabel || placeholder || name;
        if (label.length > 0 || visible) {
          detectedInputs.push({
            label: label.substring(0, 200),
            placeholder: placeholder.substring(0, 200),
            name: name.substring(0, 200),
            type,
            required,
            visible,
          });
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Continue
  }

  // Detect textareas
  const detectedTextareas: DetectedTextarea[] = [];
  try {
    const textareas = page.locator("textarea");
    const count = await textareas.count();
    for (let i = 0; i < Math.min(count, 20); i++) {
      const ta = textareas.nth(i);
      try {
        if (await ta.isVisible()) {
          const name = (await ta.getAttribute("name")) ?? "";
          const placeholder = (await ta.getAttribute("placeholder")) ?? "";
          const ariaLabel = (await ta.getAttribute("aria-label")) ?? "";
          const required = (await ta.getAttribute("required")) !== null;
          const label = ariaLabel || placeholder || name;
          detectedTextareas.push({
            label: label.substring(0, 200),
            placeholder: placeholder.substring(0, 200),
            name: name.substring(0, 200),
            required,
          });
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Continue
  }

  // Detect selects
  const detectedSelects: DetectedSelect[] = [];
  try {
    const selects = page.locator("select");
    const count = await selects.count();
    for (let i = 0; i < Math.min(count, 20); i++) {
      const sel = selects.nth(i);
      try {
        if (await sel.isVisible()) {
          const name = (await sel.getAttribute("name")) ?? "";
          const ariaLabel = (await sel.getAttribute("aria-label")) ?? "";
          const required = (await sel.getAttribute("required")) !== null;
          const optionCount = await sel.locator("option").count();
          const label = ariaLabel || name;
          detectedSelects.push({
            label: label.substring(0, 200),
            name: name.substring(0, 200),
            optionCount,
            required,
          });
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Continue
  }

  // Detect questions (labels, legends, headings in form context)
  const detectedQuestions: DetectedQuestion[] = [];
  try {
    // Labels
    const labels = page.locator("label");
    const labelCount = await labels.count();
    for (let i = 0; i < Math.min(labelCount, 50); i++) {
      try {
        const label = labels.nth(i);
        if (await label.isVisible()) {
          const text = (await label.textContent())?.trim();
          if (text && text.length > 2 && text.length < 500) {
            detectedQuestions.push({ text, source: "label" });
          }
        }
      } catch {
        // Skip
      }
    }

    // Legends
    const legends = page.locator("legend");
    const legendCount = await legends.count();
    for (let i = 0; i < Math.min(legendCount, 20); i++) {
      try {
        const legend = legends.nth(i);
        if (await legend.isVisible()) {
          const text = (await legend.textContent())?.trim();
          if (text && text.length > 2 && text.length < 500) {
            detectedQuestions.push({ text, source: "legend" });
          }
        }
      } catch {
        // Skip
      }
    }

    // Headings in form context
    const formHeadings = page.locator(
      "form h2, form h3, form h4, [class*='form'] h2, [class*='form'] h3, [class*='form'] h4"
    );
    const headingCount = await formHeadings.count();
    for (let i = 0; i < Math.min(headingCount, 20); i++) {
      try {
        const heading = formHeadings.nth(i);
        if (await heading.isVisible()) {
          const text = (await heading.textContent())?.trim();
          if (text && text.length > 2 && text.length < 500) {
            detectedQuestions.push({ text, source: "heading" });
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Continue
  }

  // Detect submit button candidates
  const submitButtonCandidates: SubmitCandidate[] = [];
  try {
    const allButtons = page.locator("button, input[type='submit']");
    const count = await allButtons.count();
    for (let i = 0; i < Math.min(count, 30); i++) {
      const btn = allButtons.nth(i);
      try {
        if (await btn.isVisible()) {
          const text = ((await btn.textContent()) ?? "").toLowerCase().trim();
          const tag = await btn.evaluate((el) => el.tagName.toLowerCase());
          const type = (await btn.getAttribute("type")) ?? "";

          const isSubmit = SUBMIT_LABELS.some((l) => text.includes(l));
          const isBlocked = BLOCKED_LABELS.some((b) => text.includes(b));

          if (isSubmit && !isBlocked) {
            submitButtonCandidates.push({
              text: text.substring(0, 200),
              tag,
              type,
              selector: `button/index-${i}`,
            });
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Continue
  }

  // Determine flow type and platform
  const hasFormFields =
    detectedInputs.length > 0 || detectedTextareas.length > 0 || detectedSelects.length > 0;
  const content = await page.content().catch(() => "");
  const flowType = classifyFlowType(currentUrl, hasFormFields);
  const platform = classifyPlatform(currentUrl, content);

  // Determine final submit risk
  let finalSubmitRisk: "low" | "medium" | "high" = "low";
  if (submitButtonCandidates.length === 0) {
    finalSubmitRisk = "medium";
  }
  if (flowType === "external_redirect" || flowType === "unknown") {
    finalSubmitRisk = "high";
  }

  return {
    currentUrl,
    pageTitle,
    flowType,
    platform,
    detectedButtons,
    detectedInputs,
    detectedTextareas,
    detectedSelects,
    detectedQuestions,
    submitButtonCandidates,
    finalSubmitRisk,
    screenshotPath,
  };
}

// ── Main Calibration Function ──────────────────────────────────────────

export async function calibrateJobApply({
  jobListingId,
  jobUrl,
  campaignId,
}: {
  jobListingId: string;
  jobUrl: string;
  campaignId: string;
}): Promise<CalibrationResult> {
  // Create calibration record first
  const calibration = await prisma.applicationCalibration.create({
    data: {
      jobListingId,
      campaignId,
      status: "in_progress",
      notes: "Kalibrasi dimulai...",
    },
  });

  const calibrationId = calibration.id;

  await writeAutomationLog({
    campaignId,
    jobListingId,
    event: "application.calibration_started",
    message: `Kalibrasi apply dimulai untuk lowongan ${jobListingId}`,
    metadata: { calibrationId },
  });

  try {
    // Launch visible browser
    const session = await launchManagedBrowser();
    const page = session.page;

    // Step 1: Open job URL
    await writeAutomationLog({
      campaignId,
      jobListingId,
      event: "application.calibration_job_opened",
      message: `Membuka halaman lowongan: ${jobUrl}`,
      metadata: { calibrationId },
    });

    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Step 2: Check for manual intervention on page load
    const intervention1 = await detectManualIntervention(page);
    if (intervention1.detected && intervention1.reason) {
      const screenshotPath = await saveCalibrationScreenshot(page, "intervention", calibrationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "warn",
        event: "application.calibration_manual_intervention",
        message: `Intervensi manual terdeteksi: ${intervention1.details ?? intervention1.reason}`,
        metadata: { calibrationId, reason: intervention1.reason, details: intervention1.details ?? null },
      });

      await prisma.applicationCalibration.update({
        where: { id: calibrationId },
        data: {
          status: "manual_intervention",
          notes: `Intervensi manual terdeteksi: ${intervention1.details ?? intervention1.reason}. Selesaikan di browser yang terbuka, lalu jalankan ulang kalibrasi.`,
          screenshotPath,
          currentUrl: page.url(),
          pageTitle: await page.title().catch(() => ""),
        },
      });

      // Do NOT close browser - user needs to complete intervention
      return {
        status: "manual_intervention",
        message:
          "Jobstreet meminta login atau verifikasi manual. Selesaikan di browser yang terbuka, lalu jalankan ulang kalibrasi.",
        calibrationId,
        screenshotPath,
      };
    }

    // Step 3: Detect apply button
    const applyMatch = await detectApplyButton(page);

    if (!applyMatch.found) {
      const screenshotPath = await saveCalibrationScreenshot(page, "no_apply_button", calibrationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "warn",
        event: "application.calibration_apply_button_not_found",
        message: "Tombol lamar tidak ditemukan di halaman lowongan.",
        metadata: { calibrationId, url: page.url() },
      });

      // Still snapshot what we can see
      const snapshot = await snapshotForm(page, screenshotPath);

      await prisma.applicationCalibration.update({
        where: { id: calibrationId },
        data: {
          status: "failed",
          flowType: snapshot.flowType,
          platform: snapshot.platform,
          currentUrl: snapshot.currentUrl,
          pageTitle: snapshot.pageTitle,
          detectedFieldsJson: JSON.stringify({
            inputs: snapshot.detectedInputs,
            textareas: snapshot.detectedTextareas,
            selects: snapshot.detectedSelects,
          }),
          detectedQuestionsJson: JSON.stringify(snapshot.detectedQuestions),
          detectedButtonsJson: JSON.stringify(snapshot.detectedButtons),
          submitCandidatesJson: JSON.stringify(snapshot.submitButtonCandidates),
          screenshotPath: snapshot.screenshotPath,
          notes: "Tombol lamar tidak ditemukan di halaman lowongan.",
        },
      });

      return {
        status: "failed",
        message:
          "Tombol lamar tidak ditemukan di halaman lowongan. Kemungkinan lowongan sudah ditutup atau format halaman berubah.",
        calibrationId,
        flowType: snapshot.flowType,
        platform: snapshot.platform,
        screenshotPath,
      };
    }

    await writeAutomationLog({
      campaignId,
      jobListingId,
      event: "application.calibration_apply_button_found",
      message: `Tombol lamar ditemukan (strategi: ${applyMatch.strategy})`,
      metadata: { calibrationId, strategy: applyMatch.strategy, selector: applyMatch.selector },
    });

    // Step 4: Click apply button for calibration
    try {
      // Re-find and click the button
      const btn = page.locator(applyMatch.selector).first();
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await btn.click();
      } else {
        // Fallback: try generic detection again
        const fallbackTexts = ["Lamar", "Apply", "Lamar sekarang", "Apply now"];
        let clicked = false;
        for (const text of fallbackTexts) {
          try {
            const el = page.locator(`button:has-text('${text}'), a:has-text('${text}')`).first();
            if ((await el.count()) > 0 && (await el.isVisible())) {
              await el.click();
              clicked = true;
              break;
            }
          } catch {
            // Continue
          }
        }
        if (!clicked) {
          throw new Error("Tidak bisa mengklik tombol lamar.");
        }
      }
    } catch (clickError) {
      const screenshotPath = await saveCalibrationScreenshot(page, "click_failed", calibrationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "error",
        event: "application.calibration_failed",
        message: `Gagal mengklik tombol lamar: ${clickError instanceof Error ? clickError.message : String(clickError)}`,
        metadata: { calibrationId },
      });

      await prisma.applicationCalibration.update({
        where: { id: calibrationId },
        data: {
          status: "failed",
          screenshotPath,
          notes: `Gagal mengklik tombol lamar: ${clickError instanceof Error ? clickError.message : String(clickError)}`,
        },
      });

      return {
        status: "failed",
        message: "Gagal mengklik tombol lamar.",
        calibrationId,
        screenshotPath,
        error: clickError instanceof Error ? clickError.message : String(clickError),
      };
    }

    await writeAutomationLog({
      campaignId,
      jobListingId,
      event: "application.calibration_apply_button_clicked",
      message: "Tombol lamar berhasil diklik untuk kalibrasi.",
      metadata: { calibrationId },
    });

    // Step 5: Wait for navigation/modal/form to load
    await page.waitForTimeout(4000);

    // Step 6: Check for intervention after clicking apply
    const intervention2 = await detectManualIntervention(page);
    if (intervention2.detected && intervention2.reason) {
      const screenshotPath = await saveCalibrationScreenshot(page, "post_click_intervention", calibrationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "warn",
        event: "application.calibration_manual_intervention",
        message: `Intervensi manual terdeteksi setelah klik apply: ${intervention2.details ?? intervention2.reason}`,
        metadata: { calibrationId, reason: intervention2.reason },
      });

      await prisma.applicationCalibration.update({
        where: { id: calibrationId },
        data: {
          status: "manual_intervention",
          screenshotPath,
          currentUrl: page.url(),
          pageTitle: await page.title().catch(() => ""),
          notes: `Intervensi manual setelah klik apply: ${intervention2.details ?? intervention2.reason}`,
        },
      });

      return {
        status: "manual_intervention",
        message:
          "Jobstreet meminta login atau verifikasi manual setelah klik lamar. Selesaikan di browser yang terbuka, lalu jalankan ulang kalibrasi.",
        calibrationId,
        screenshotPath,
      };
    }

    // Step 7: Check for email apply instructions on page (mailto: detection)
    const pageContent = await page.content().catch(() => "");
    const hasEmailInstructions =
      pageContent.toLowerCase().includes("email your") ||
      pageContent.toLowerCase().includes("kirim email") ||
      pageContent.toLowerCase().includes("send your cv to") ||
      pageContent.toLowerCase().includes("kirim cv ke");

    // Step 8: Snapshot the form
    const screenshotPath = await saveCalibrationScreenshot(page, "form_snapshot", calibrationId);
    const snapshot = await snapshotForm(page, screenshotPath);

    // Override flow type if email instructions detected
    if (hasEmailInstructions && snapshot.flowType !== "email_apply") {
      snapshot.flowType = "email_apply";
    }

    await writeAutomationLog({
      campaignId,
      jobListingId,
      event: "application.calibration_flow_classified",
      message: `Flow terklasifikasi: ${snapshot.flowType}, Platform: ${snapshot.platform}`,
      metadata: {
        calibrationId,
        flowType: snapshot.flowType,
        platform: snapshot.platform,
        fieldsCount: snapshot.detectedInputs.length + snapshot.detectedTextareas.length + snapshot.detectedSelects.length,
        questionsCount: snapshot.detectedQuestions.length,
        buttonsCount: snapshot.detectedButtons.length,
        submitCandidates: snapshot.submitButtonCandidates.length,
      },
    });

    // Step 9: Determine notes
    let notes = "";
    if (snapshot.flowType === "external_redirect") {
      notes =
        "Lowongan ini mengarah ke website eksternal. Sistem perlu mode pengisian eksternal dan review user sebelum bisa melanjutkan.";
    } else if (snapshot.flowType === "email_apply") {
      notes = "Lowongan ini menggunakan apply via email. Sistem perlu mode pengisian email.";
    } else if (snapshot.flowType === "whatsapp_apply") {
      notes = "Lowongan ini menggunakan apply via WhatsApp. Sistem perlu mode pengisian WhatsApp.";
    } else if (snapshot.flowType === "jobstreet_internal") {
      notes = `Flow internal Jobstreet terdeteksi. ${snapshot.detectedInputs.length} input, ${snapshot.detectedTextareas.length} textarea, ${snapshot.detectedSelects.length} select, ${snapshot.detectedQuestions.length} pertanyaan terdeteksi.`;
    } else {
      notes = `Flow tidak dikenal. URL: ${snapshot.currentUrl}`;
    }

    // Step 10: Save calibration result
    await prisma.applicationCalibration.update({
      where: { id: calibrationId },
      data: {
        status: "calibrated",
        flowType: snapshot.flowType,
        platform: snapshot.platform,
        currentUrl: snapshot.currentUrl,
        pageTitle: snapshot.pageTitle,
        detectedFieldsJson: JSON.stringify({
          inputs: snapshot.detectedInputs,
          textareas: snapshot.detectedTextareas,
          selects: snapshot.detectedSelects,
        }),
        detectedQuestionsJson: JSON.stringify(snapshot.detectedQuestions),
        detectedButtonsJson: JSON.stringify(snapshot.detectedButtons),
        submitCandidatesJson: JSON.stringify(snapshot.submitButtonCandidates),
        screenshotPath: snapshot.screenshotPath,
        notes,
      },
    });

    await writeAutomationLog({
      campaignId,
      jobListingId,
      event: "application.calibration_form_snapshot_saved",
      message: `Snapshot form tersimpan. Flow: ${snapshot.flowType}, Platform: ${snapshot.platform}`,
      metadata: { calibrationId, flowType: snapshot.flowType, platform: snapshot.platform },
    });

    if (snapshot.flowType === "external_redirect") {
      await writeAutomationLog({
        campaignId,
        jobListingId,
        event: "application.calibration_external_redirect",
        message: "Lowongan mengarah ke website eksternal.",
        metadata: { calibrationId, url: snapshot.currentUrl },
      });
    }

    // Browser intentionally left open for user review
    return {
      status: "calibrated",
      message: notes,
      calibrationId,
      flowType: snapshot.flowType,
      platform: snapshot.platform,
      screenshotPath: snapshot.screenshotPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await writeAutomationLog({
      campaignId,
      jobListingId,
      level: "error",
      event: "application.calibration_failed",
      message: `Gagal menjalankan kalibrasi: ${errorMessage}`,
      metadata: { calibrationId, error: errorMessage },
    });

    try {
      await prisma.applicationCalibration.update({
        where: { id: calibrationId },
        data: {
          status: "failed",
          notes: `Gagal menjalankan kalibrasi: ${errorMessage}`,
        },
      });
    } catch {
      // If we can't update, just log
    }

    return {
      status: "failed",
      message: "Terjadi kesalahan saat menjalankan kalibrasi.",
      calibrationId,
      error: errorMessage,
    };
  }
}
