import type { Page } from "playwright";
import { launchManagedBrowser } from "@/lib/browser/playwright-manager";
import {
  fillKnownApplicationFields,
  detectFormQuestions,
  detectSubmitButton,
  type FilledField,
} from "@/lib/browser/form-filler";
import { detectManualIntervention } from "@/lib/browser/page-detector";
import { answerApplicationQuestion } from "@/lib/ai/question-answerer";
import type { QuestionAnswerResult } from "@/lib/ai/schemas";
import { prisma } from "@/lib/db/prisma";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { runAiApplyWizard } from "@/lib/browser/ai-apply-wizard";
import {
  detectApplyWizardState,
  hasWizardProgress,
  type ApplyWizardSnapshot,
} from "@/lib/browser/apply-wizard-state";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

type JobListingData = {
  id: string;
  campaignId: string | null;
  title: string;
  company: string;
  location: string | null;
  salaryText: string | null;
  workType: string | null;
  url: string;
  description: string | null;
  matchScore: number | null;
  matchReason: string | null;
  status: string;
};

type SubmitModeStrategy = "review_each_application" | "auto_submit_safe_only";

type CampaignData = {
  id: string;
  name: string;
  submitMode: string;
  automationMode?: string;
  formAutomationMode?: string;
  autoSubmitSafeOnly?: boolean;
  lowScoreMode?: string;
  defaultCurrentSalary: number;
  defaultExpectedSalary: number;
  defaultNoticePeriod: string;
  defaultAvailability: string;
  workModePreference: string | null;
};

type ProfileData = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skillsJson: string;
  experienceJson: string;
  educationJson: string;
  projectsJson: string;
  certificationsJson: string;
};

type ApplyResult = {
  status: "submitted" | "pending_review" | "paused" | "failed" | "apply_unavailable";
  message: string;
  applicationId?: string;
  error?: string;
  screenshotPath?: string;
};

type SubmitResult = {
  status: "submitted" | "failed" | "paused";
  message: string;
  screenshotPath?: string;
  error?: string;
};

// Allowed submit button labels (safe matching)
const ALLOWED_SUBMIT_LABELS = [
  "submit application",
  "kirim lamaran",
  "send application",
  "submit",
];

// Labels that should NOT be clicked as submit (navigation/search/save)
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
];

const CONTINUE_LABELS = [
  "continue",
  "next",
  "selanjutnya",
  "lanjut",
  "proceed",
  "review",
  "continue application",
];

const SUBMIT_SUCCESS_MARKERS = [
  "application submitted",
  "your application has been submitted",
  "your application has been sent",
  "you applied",
  "applied",
  "lamaran terkirim",
  "lamaran berhasil dikirim",
  "anda telah melamar",
  "application received",
  "terima kasih telah melamar",
  "thank you for applying",
];

type AnswersJson = {
  fieldsFilled: FilledField[];
  questionAnswers: Array<{
    question: string;
    answer: string;
    confidence: number;
    source: string;
  }>;
  pendingQuestions: Array<{
    question: string;
    reason: string;
  }>;
};

type FinalSubmitCandidate = {
  locator: string;
  text: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

// ── Helpers ────────────────────────────────────────────────────────────

function normalizeQuestion(text: string): string {
  return text.toLowerCase().replace(/[?.,!:;]+/g, "").replace(/\s+/g, " ").trim();
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function buildCandidateProfile(profile: ProfileData) {
  return {
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    summary: profile.summary,
    skills: parseJsonArray<string>(profile.skillsJson),
    workExperience: parseJsonArray<Record<string, unknown>>(profile.experienceJson),
    education: parseJsonArray<Record<string, unknown>>(profile.educationJson),
    projects: parseJsonArray<Record<string, unknown>>(profile.projectsJson),
    certifications: parseJsonArray<string>(profile.certificationsJson),
    suggestedJobRoles: [],
  };
}

// ── Screenshot Helper ─────────────────────────────────────────────────

async function saveScreenshot(
  page: Page,
  label: string,
  applicationId: string,
): Promise<string | null> {
  try {
    const screenshotDir = path.join(process.cwd(), "storage", "screenshots");
    await mkdir(screenshotDir, { recursive: true });
    const fileName = `${applicationId}-${label}-${Date.now()}.png`;
    const filePath = path.join(screenshotDir, fileName);
    await page.screenshot({ path: filePath, fullPage: true });
    return `./storage/screenshots/${fileName}`;
  } catch {
    return null;
  }
}

// ── Intervention Check (reuse) ────────────────────────────────────────

async function checkAndHandleIntervention(
  page: Page,
  jobId: string,
  campaignId: string,
  stage: string,
): Promise<ApplyResult | null> {
  const detection = await detectManualIntervention(page);
  if (detection.detected && detection.reason) {
    await writeAutomationLog({
      campaignId,
      jobListingId: jobId,
      level: "warn",
      event: "application.manual_intervention_required",
      message: `Intervensi manual terdeteksi pada tahap ${stage}: ${detection.details ?? detection.reason}`,
      metadata: { stage, reason: detection.reason, details: detection.details ?? null },
    });

    const app = await prisma.application.create({
      data: {
        campaignId,
        jobListingId: jobId,
        status: "paused",
        submitMode: "assisted_auto_apply",
        notes: `Intervensi manual diperlukan pada tahap: ${stage}. ${detection.details ?? ""}`,
      },
    });

    return {
      status: "paused",
      message: "Jobstreet meminta login atau verifikasi manual. Selesaikan di browser yang terbuka, lalu klik Lanjutkan.",
      applicationId: app.id,
    };
  }
  return null;
}

function resolveSubmitMode(campaign: CampaignData, submitMode?: SubmitModeStrategy): SubmitModeStrategy {
  if (submitMode) return submitMode;
  if (campaign.autoSubmitSafeOnly || campaign.automationMode === "auto_submit_safe_only") {
    return "auto_submit_safe_only";
  }
  return "review_each_application";
}

async function verifySubmitSuccess(page: Page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);

  const pageText = (await page.textContent("body").catch(() => ""))?.toLowerCase() ?? "";
  const submitSuccessDetected = SUBMIT_SUCCESS_MARKERS.some((marker) => pageText.includes(marker));
  const submitButtonStillVisible = await page
    .locator("button, input[type='submit'], input[type='button'], a[role='button']")
    .evaluateAll((elements, labels) =>
      elements.some((el) => {
        const text = ((el.textContent || (el as HTMLInputElement).value || "").trim().toLowerCase());
        const visible = !(el as HTMLElement).hasAttribute("disabled")
          && ((el as HTMLElement).offsetParent !== null || getComputedStyle(el as HTMLElement).position === "fixed");
        return visible && (labels as string[]).some((label) => text === label || text.includes(label));
      }),
      ALLOWED_SUBMIT_LABELS,
    )
    .catch(() => false);

  return {
    submitSuccessDetected,
    submitButtonStillVisible,
    visibleConfirmationText: pageText.slice(0, 2000),
    currentUrl: page.url(),
  };
}

async function findFinalSubmitButton(page: Page): Promise<FinalSubmitCandidate | null> {
  const reviewAreaSelectors = [
    "form",
    "main form",
    "[role='form']",
    "[data-automation*='review' i]",
    "[data-automation*='application' i]",
    "[class*='review' i]",
    "[class*='application' i]",
  ];

  const candidates: FinalSubmitCandidate[] = [];

  for (const area of reviewAreaSelectors) {
    for (const selector of ["button", "button[type='submit']", "input[type='submit']", "input[type='button']", "a[role='button']"]) {
      const scopedSelector = `${area} ${selector}`;
      try {
        const elements = page.locator(scopedSelector);
        const count = await elements.count();
        for (let i = 0; i < Math.min(count, 20); i++) {
          const el = elements.nth(i);
          if (!(await el.isVisible()).valueOf()) continue;
          if ((await el.isDisabled().catch(() => false)).valueOf()) continue;

          const text = (((await el.textContent()) ?? (await el.getAttribute("value")) ?? "").trim());
          const normalizedText = text.toLowerCase();
          if (!text) continue;
          if (BLOCKED_SUBMIT_LABELS.some((label) => normalizedText === label || normalizedText.includes(label))) continue;

          const isExactAllowed = ALLOWED_SUBMIT_LABELS.some((label) => normalizedText === label);
          const containsAllowed = ALLOWED_SUBMIT_LABELS.some((label) => normalizedText.includes(label));
          const isSubmitType = (await el.getAttribute("type").catch(() => null))?.toLowerCase() === "submit";

          if (isExactAllowed && ["submit application", "kirim lamaran", "submit", "send application"].includes(normalizedText)) {
            return {
              locator: scopedSelector,
              text,
              confidence: "high",
              reason: "Label submit final cocok persis di area review/form.",
            };
          }

          if (isSubmitType && containsAllowed) {
            candidates.push({
              locator: scopedSelector,
              text,
              confidence: "high",
              reason: "Button type submit ditemukan di area review/application dengan label submit yang sesuai.",
            });
            continue;
          }

          if (containsAllowed) {
            candidates.push({
              locator: scopedSelector,
              text,
              confidence: "medium",
              reason: "Label mengandung kata submit tetapi tidak cukup spesifik untuk auto-submit.",
            });
          }
        }
      } catch {
        // ignore candidate read errors
      }
    }
  }

  return candidates.find((candidate) => candidate.confidence === "high")
    ?? candidates[0]
    ?? null;
}

async function hasUnresolvedRequiredFields(page: Page, filledFields: FilledField[]) {
  const filledValueSet = new Set(
    filledFields
      .filter((field) => field.filled && field.value.trim())
      .map((field) => normalizeQuestion(field.label)),
  );

  const empties = await page.locator("input, textarea, select").evaluateAll((elements) =>
    elements
      .map((el) => {
        const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const required = input.required || input.getAttribute("aria-required") === "true";
        const disabled = input.hasAttribute("disabled");
        const hidden = (input as HTMLElement).offsetParent === null;
        const value = (input.value || "").trim();
        const label = input.getAttribute("aria-label")
          || input.getAttribute("placeholder")
          || input.getAttribute("name")
          || input.id
          || input.tagName.toLowerCase();
        return { required, disabled, hidden, value, label };
      })
      .filter((item) => item.required && !item.disabled && !item.hidden && !item.value),
  ).catch(() => [] as Array<{ label: string }>);

  return empties.filter((item) => !filledValueSet.has(normalizeQuestion(item.label)));
}

async function runJobstreetApplyWizard({
  page,
  jobListing,
  campaign,
  profile,
  submitMode,
}: {
  page: Page;
  jobListing: JobListingData;
  campaign: CampaignData;
  profile: ProfileData;
  submitMode: SubmitModeStrategy;
}): Promise<ApplyResult> {
  let applicationId: string | null = null;

  const fallbackToAi = async (reason: string, metadata?: Record<string, unknown>) => {
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      level: "warn",
      event: "ai_ui.fallback_started",
      message: `Wizard deterministic berhenti: ${reason}. Beralih ke AI UI Agent.`,
      metadata,
    });

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "ai_ui.apply_button_recovery_attempted",
      message: "AI UI Agent mencoba mencari aksi Lamar/Lanjut yang aman dari elemen yang terlihat.",
      metadata: {
        reason,
        ...metadata,
      },
    });

    const aiResult = await runAiApplyWizard({
      page,
      jobListing,
      campaign: {
        ...campaign,
        formAutomationMode: campaign.formAutomationMode ?? "ai_fallback",
      },
      profile,
      mode: submitMode,
    });

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      level: aiResult.status === "apply_unavailable" ? "warn" : "info",
      event:
        aiResult.status === "apply_unavailable"
          ? "ai_ui.apply_button_recovery_failed"
          : "ai_ui.apply_button_recovery_succeeded",
      message:
        aiResult.status === "apply_unavailable"
          ? "AI UI Agent tidak menemukan aksi Lamar/Lanjut yang aman. Lowongan akan dilewati."
          : "AI UI Agent menemukan aksi aman untuk melanjutkan flow lamaran.",
      metadata: {
        reason,
        resultStatus: aiResult.status,
        applicationId: aiResult.applicationId ?? null,
        ...metadata,
      },
    });

    return aiResult;
  };

  try {
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "application.job_opened",
      message: `Membuka halaman lowongan: ${jobListing.url}`,
    });

    await page.goto(jobListing.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);

    const initialIntervention = await checkAndHandleIntervention(
      page,
      jobListing.id,
      campaign.id,
      "halaman_lowongan",
    );
    if (initialIntervention) return initialIntervention;

    const filledFields: FilledField[] = [];
    const questionAnswers: AnswersJson["questionAnswers"] = [];
    const pendingQuestions: AnswersJson["pendingQuestions"] = [];
    const candidateProfile = buildCandidateProfile(profile);
    let watchdogNoProgress = 0;
    let wizardStep = 0;
    let previousSnapshot: ApplyWizardSnapshot | null = null;
    let lastQuestionFingerprint = "";

    const persistPausedApplication = async (note: string, message: string) => {
      const app = await prisma.application.create({
        data: {
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          status: "paused",
          submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
          notes: note,
          answersJson: JSON.stringify({ fieldsFilled: filledFields, questionAnswers, pendingQuestions }),
        },
      });
      applicationId = app.id;
      await prisma.jobListing.update({ where: { id: jobListing.id }, data: { status: "applying" } });
      return {
        status: "paused" as const,
        message,
        applicationId: app.id,
      };
    };

    for (wizardStep = 1; wizardStep <= 8; wizardStep += 1) {
      const snapshot = await detectApplyWizardState(page);
      const progress = hasWizardProgress(previousSnapshot, snapshot);
      watchdogNoProgress = progress ? 0 : watchdogNoProgress + 1;

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "application.wizard_state_detected",
        message: `Wizard state: ${snapshot.state}`,
        metadata: {
          step: wizardStep,
          state: snapshot.state,
          reason: snapshot.reason,
          url: snapshot.url,
          noProgressCount: watchdogNoProgress,
        },
      });

      if (snapshot.state === "submitted_success") {
        const app = await prisma.application.create({
          data: {
            campaignId: campaign.id,
            jobListingId: jobListing.id,
            status: "submitted",
            submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
            notes: "Lamaran sudah terverifikasi terkirim oleh wizard stateful.",
            answersJson: JSON.stringify({ fieldsFilled: filledFields, questionAnswers, pendingQuestions }),
            submittedAt: new Date(),
            userApproved: true,
          },
        });
        applicationId = app.id;
        await prisma.jobListing.update({ where: { id: jobListing.id }, data: { status: "submitted" } });
        await prisma.campaign.update({ where: { id: campaign.id }, data: { appliedCount: { increment: 1 } } });
        return {
          status: "submitted",
          message: "Lamaran berhasil dikirim.",
          applicationId: app.id,
        };
      }

      if (snapshot.state === "manual_intervention") {
        return (await checkAndHandleIntervention(page, jobListing.id, campaign.id, `wizard_${wizardStep}`))
          ?? await persistPausedApplication(
            "Wizard mendeteksi login/verifikasi manual.",
            "Jobstreet meminta login atau verifikasi manual. Selesaikan di browser yang terbuka, lalu klik Lanjutkan.",
          );
      }

      if (snapshot.state === "external_redirect") {
        return await persistPausedApplication(
          "Flow eksternal terdeteksi. Submit otomatis dihentikan.",
          "Flow eksternal terdeteksi. Kampanye dijeda dan tidak melakukan submit otomatis.",
        );
      }

      if (watchdogNoProgress >= 2 || snapshot.state === "unknown" || snapshot.state === "stuck") {
        return await fallbackToAi("watchdog/no-progress atau state tidak dikenali", {
          step: wizardStep,
          state: snapshot.state,
          noProgressCount: watchdogNoProgress,
          reason: snapshot.reason,
        });
      }

      if (snapshot.state === "job_detail" || snapshot.state === "apply_button_visible") {
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.searching_apply_button",
          message: "Mencari tombol lamar...",
          metadata: { step: wizardStep, state: snapshot.state },
        });

        const applyButtonFound = await findAndClickApplyButton(page);
        if (!applyButtonFound) {
          return await fallbackToAi("tombol apply tidak ditemukan", {
            step: wizardStep,
            state: snapshot.state,
          });
        }

        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.apply_button_clicked",
          message: "Tombol lamar berhasil diklik.",
          metadata: { step: wizardStep },
        });
        await page.waitForTimeout(2000);
        previousSnapshot = snapshot;
        continue;
      }

      if (snapshot.state === "application_form") {
        const newlyFilled = await fillKnownApplicationFields(page, profile, {
          currentSalary: campaign.defaultCurrentSalary,
          expectedSalary: campaign.defaultExpectedSalary,
          noticePeriod: campaign.defaultNoticePeriod,
          availability: campaign.defaultAvailability,
        });

        for (const field of newlyFilled) {
          const key = `${field.selector}|${field.label}`;
          const existingIndex = filledFields.findIndex((item) => `${item.selector}|${item.label}` === key);
          if (existingIndex >= 0) {
            filledFields[existingIndex] = field;
          } else {
            filledFields.push(field);
          }
        }

        const filledCount = newlyFilled.filter((field) => field.filled).length;
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.field_filled",
          message: `${filledCount} field berhasil diisi pada langkah wizard ${wizardStep}.`,
          metadata: { step: wizardStep, fields: newlyFilled },
        });

        const nextResult = await clickSafeContinueButton(page);
        if (!nextResult.clicked) {
          return await fallbackToAi("form tidak maju setelah field diisi", {
            step: wizardStep,
            state: snapshot.state,
            fieldsFilled: filledCount,
          });
        }

        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.continue_clicked",
          message: `Wizard mengklik tombol lanjut: ${nextResult.label ?? "unknown"}`,
          metadata: { step: wizardStep },
        });
        previousSnapshot = snapshot;
        continue;
      }

      if (snapshot.state === "question_step") {
        const questionTexts = await detectFormQuestions(page);
        const questionFingerprint = JSON.stringify(questionTexts.map((question) => normalizeQuestion(question)).sort());

        if (questionFingerprint && questionFingerprint === lastQuestionFingerprint) {
          return await fallbackToAi("pertanyaan tidak berubah setelah pemrosesan deterministic", {
            step: wizardStep,
            questions: questionTexts,
          });
        }
        lastQuestionFingerprint = questionFingerprint;

        const alreadyFilledLabels = new Set(
          filledFields.filter((field) => field.filled).map((field) => normalizeQuestion(field.label)),
        );

        for (const questionText of questionTexts) {
          const normalized = normalizeQuestion(questionText);
          if (!normalized) continue;
          if (questionAnswers.some((item) => normalizeQuestion(item.question) === normalized)) continue;
          if (pendingQuestions.some((item) => normalizeQuestion(item.question) === normalized)) continue;

          let isAlreadyFilled = false;
          for (const label of alreadyFilledLabels) {
            if (normalized.includes(label) || label.includes(normalized)) {
              isAlreadyFilled = true;
              break;
            }
          }
          if (isAlreadyFilled) continue;

          await writeAutomationLog({
            campaignId: campaign.id,
            jobListingId: jobListing.id,
            event: "application.question_detected",
            message: `Pertanyaan terdeteksi: "${questionText}"`,
            metadata: { step: wizardStep, question: questionText },
          });

          const memory = await prisma.questionMemory.findFirst({
            where: {
              questionNormalized: normalized,
              confidence: { gte: 0.7 },
            },
          });

          if (memory) {
            questionAnswers.push({
              question: questionText,
              answer: memory.answer,
              confidence: memory.confidence,
              source: "memory",
            });

            await prisma.questionMemory.update({
              where: { id: memory.id },
              data: { usageCount: { increment: 1 } },
            });
            continue;
          }

          try {
            const aiResult: QuestionAnswerResult = await answerApplicationQuestion({
              question: questionText,
              candidateProfile,
              campaignDefaults: {
                currentSalary: campaign.defaultCurrentSalary,
                expectedSalary: campaign.defaultExpectedSalary,
                noticePeriod: campaign.defaultNoticePeriod,
                availability: campaign.defaultAvailability,
              },
            });

            if (aiResult.confidence >= 0.7 && !aiResult.requiresHumanReview) {
              questionAnswers.push({
                question: questionText,
                answer: aiResult.answer,
                confidence: aiResult.confidence,
                source: "ai",
              });

              await prisma.questionMemory.upsert({
                where: { questionNormalized: normalized },
                update: {
                  answer: aiResult.answer,
                  confidence: aiResult.confidence,
                  usageCount: { increment: 1 },
                  source: "ai_answer",
                },
                create: {
                  questionRaw: questionText,
                  questionNormalized: normalized,
                  answer: aiResult.answer,
                  confidence: aiResult.confidence,
                  source: "ai_answer",
                  usageCount: 1,
                },
              });
            } else {
              pendingQuestions.push({
                question: questionText,
                reason: aiResult.requiresHumanReview
                  ? "Memerlukan review manual dari user."
                  : `Confidence rendah (${Math.round(aiResult.confidence * 100)}%).`,
              });
            }
          } catch (error) {
            pendingQuestions.push({
              question: questionText,
              reason: `Gagal mendapatkan jawaban AI: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }

        if (pendingQuestions.length > 0) {
          return await persistPausedApplication(
            `Ada ${pendingQuestions.length} pertanyaan yang memerlukan input user.`,
            `Ada ${pendingQuestions.length} pertanyaan yang memerlukan jawaban Anda.`,
          );
        }

        const nextResult = await clickSafeContinueButton(page);
        if (!nextResult.clicked) {
          return await fallbackToAi("pertanyaan terjawab tetapi wizard tidak lanjut", {
            step: wizardStep,
            state: snapshot.state,
            answeredQuestions: questionAnswers.length,
          });
        }

        previousSnapshot = snapshot;
        continue;
      }

      if (snapshot.state === "review_step") {
        const genericSubmitSelector = await detectSubmitButton(page);
        const finalSubmitCandidate = await findFinalSubmitButton(page);
        if (genericSubmitSelector || finalSubmitCandidate) {
          previousSnapshot = snapshot;
          continue;
        }

        const nextResult = await clickSafeContinueButton(page);
        if (!nextResult.clicked) {
          return await fallbackToAi("review step tidak punya aksi deterministic aman", {
            step: wizardStep,
            state: snapshot.state,
          });
        }

        previousSnapshot = snapshot;
        continue;
      }

      if (snapshot.state === "final_submit_ready") {
        const answersJson: AnswersJson = {
          fieldsFilled: filledFields,
          questionAnswers,
          pendingQuestions,
        };

        const finalSubmitCandidate = await findFinalSubmitButton(page);
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.final_submit_ready_mode_detected",
          message: "Mode submit final terdeteksi dan diputuskan pada halaman yang sama.",
          metadata: {
            automationMode: campaign.automationMode ?? null,
            autoSubmitSafeOnly: campaign.autoSubmitSafeOnly ?? false,
            submitMode,
            chosenPath: submitMode === "review_each_application" ? "review_required" : "auto_submit_safe_only",
          },
        });

        const app = await prisma.application.create({
          data: {
            campaignId: campaign.id,
            jobListingId: jobListing.id,
            status: submitMode === "review_each_application" ? "pending_review" : "paused",
            submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
            notes:
              submitMode === "review_each_application"
                ? `Form lamaran sudah mencapai review final. ${filledFields.filter((item) => item.filled).length} field diisi, ${questionAnswers.length} pertanyaan dijawab. Menunggu review user.`
                : "Final submit terdeteksi. Menjalankan Auto Submit Aman di halaman yang sama.",
            answersJson: JSON.stringify(answersJson),
          },
        });
        applicationId = app.id;

        await prisma.jobListing.update({ where: { id: jobListing.id }, data: { status: "applying" } });

        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.final_submit_detected",
          message: "Final submit terdeteksi pada halaman review yang sama.",
          metadata: {
            applicationId: app.id,
            submitCandidate: finalSubmitCandidate,
            fieldsFilled: filledFields.filter((item) => item.filled).length,
            questionsAnswered: questionAnswers.length,
          },
        });

        if (submitMode === "review_each_application") {
          await writeAutomationLog({
            campaignId: campaign.id,
            jobListingId: jobListing.id,
            event: "application.review_required",
            message: "Form lamaran mencapai review final dan menunggu review user.",
            metadata: { applicationId: app.id },
          });
          return {
            status: "pending_review",
            message: "Form lamaran sudah mencapai review final dan menunggu review user.",
            applicationId: app.id,
          };
        }

        if (!finalSubmitCandidate || finalSubmitCandidate.confidence !== "high") {
          await prisma.application.update({
            where: { id: app.id },
            data: {
              status: "paused",
              notes: `Final submit ditemukan tetapi confidence belum cukup tinggi untuk Auto Submit Aman. ${finalSubmitCandidate?.reason ?? "Tidak ada kandidat final submit yang aman."}`,
            },
          });
          return {
            status: "paused",
            message: "Final submit belum cukup aman untuk diklik otomatis. Periksa browser.",
            applicationId: app.id,
          };
        }

        const unresolvedRequiredFields = await hasUnresolvedRequiredFields(page, filledFields);
        if (unresolvedRequiredFields.length > 0) {
          await prisma.application.update({
            where: { id: app.id },
            data: {
              status: "paused",
              notes: `Auto Submit Aman dihentikan karena masih ada field wajib kosong: ${unresolvedRequiredFields.map((item) => item.label).join(", ")}`,
            },
          });
          return {
            status: "paused",
            message: "Masih ada field wajib yang belum terisi. Kampanye dijeda untuk pemeriksaan manual.",
            applicationId: app.id,
          };
        }

        const beforeSubmitScreenshot = await saveScreenshot(page, "before_submit", app.id);
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.auto_submit_safe_started",
          message: "Auto Submit Aman dijalankan pada halaman yang sama.",
          metadata: { applicationId: app.id, screenshotPath: beforeSubmitScreenshot, submitCandidate: finalSubmitCandidate },
        });

        const finalButton = page
          .locator(finalSubmitCandidate.locator)
          .filter({ hasText: new RegExp(finalSubmitCandidate.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
          .first();
        await finalButton.click();

        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.submit_clicked",
          message: "Tombol submit final berhasil diklik oleh Auto Submit Aman.",
          metadata: { applicationId: app.id, submitCandidate: finalSubmitCandidate },
        });

        const afterClickScreenshot = await saveScreenshot(page, "after_submit_click", app.id);
        const verification = await verifySubmitSuccess(page);

        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.submit_post_click_diagnostics",
          message: "Diagnostik setelah klik submit berhasil dikumpulkan.",
          metadata: {
            applicationId: app.id,
            screenshotPath: afterClickScreenshot,
            currentUrl: verification.currentUrl,
            submitSuccessDetected: verification.submitSuccessDetected,
            submitButtonStillVisible: verification.submitButtonStillVisible,
            visibleConfirmationText: verification.visibleConfirmationText,
          },
        });

        const postSubmitIntervention = await detectManualIntervention(page);
        if (postSubmitIntervention.detected) {
          const screenshotPath = await saveScreenshot(page, "post_submit_intervention", app.id);
          await prisma.application.update({ where: { id: app.id }, data: { status: "paused", screenshotPath } });
          return {
            status: "paused",
            message: "Klik submit mungkin sudah dilakukan, tetapi sistem belum bisa memverifikasi. Periksa browser.",
            applicationId: app.id,
            screenshotPath: screenshotPath ?? undefined,
          };
        }

        if (!verification.submitSuccessDetected || verification.submitButtonStillVisible) {
          const screenshotPath = await saveScreenshot(page, "submit_unverified", app.id);
          await prisma.application.update({
            where: { id: app.id },
            data: {
              status: "paused",
              screenshotPath,
              notes: "Klik submit mungkin sudah dilakukan, tetapi sistem belum bisa memverifikasi. Periksa browser.",
            },
          });
          await writeAutomationLog({
            campaignId: campaign.id,
            jobListingId: jobListing.id,
            level: "warn",
            event: "application.submit_unverified",
            message: "Klik submit mungkin sudah dilakukan, tetapi sistem belum bisa memverifikasi. Periksa browser.",
            metadata: { applicationId: app.id, screenshotPath },
          });
          return {
            status: "paused",
            message: "Klik submit mungkin sudah dilakukan, tetapi sistem belum bisa memverifikasi. Periksa browser.",
            applicationId: app.id,
            screenshotPath: screenshotPath ?? undefined,
          };
        }

        const successScreenshot = await saveScreenshot(page, "after_submit", app.id);
        await prisma.application.update({
          where: { id: app.id },
          data: {
            status: "submitted",
            submittedAt: new Date(),
            userApproved: true,
            screenshotPath: successScreenshot,
            notes: "Lamaran dikirim otomatis oleh mode Auto Submit Aman.",
          },
        });
        await prisma.jobListing.update({ where: { id: jobListing.id }, data: { status: "submitted" } });
        await prisma.campaign.update({ where: { id: campaign.id }, data: { appliedCount: { increment: 1 } } });
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.submitted",
          message: "Submit berhasil diverifikasi dan lamaran ditandai terkirim.",
          metadata: { applicationId: app.id, screenshotPath: successScreenshot },
        });

        return {
          status: "submitted",
          message: "Lamaran berhasil dikirim.",
          applicationId: app.id,
          screenshotPath: successScreenshot ?? undefined,
        };
      }

      previousSnapshot = snapshot;
    }

    return await fallbackToAi("wizard mencapai batas langkah maksimum", {
      step: wizardStep,
      noProgressCount: watchdogNoProgress,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      const failedApp = await prisma.application.create({
        data: {
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          status: "failed",
          submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
          notes: `Gagal menjalankan assisted apply: ${errorMessage}`,
        },
      });
      applicationId = failedApp.id;
    } catch {
      // If we can't even create the record, just log
    }

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      level: "error",
      event: "application.failed",
      message: `Gagal menjalankan assisted apply: ${errorMessage}`,
      metadata: { error: errorMessage },
    });

    return {
      status: "failed",
      message: "Terjadi kesalahan saat menjalankan assisted apply.",
      error: errorMessage,
      applicationId: applicationId ?? undefined,
    };
  }
}

export async function startJobApplication({
  jobListing,
  campaign,
  profile,
  submitMode,
}: {
  jobListing: JobListingData;
  campaign: CampaignData;
  profile: ProfileData;
  submitMode?: SubmitModeStrategy;
}): Promise<ApplyResult> {
  const session = await launchManagedBrowser();
  try {
    return await runJobstreetApplyWizard({
      page: session.page,
      jobListing,
      campaign,
      profile,
      submitMode: resolveSubmitMode(campaign, submitMode),
    });
  } finally {
    // Browser intentionally remains visible for safety policy and manual inspection.
  }
}

// ── Submit Application ────────────────────────────────────────────────

export async function submitApplication({
  applicationId,
  jobListingUrl,
  campaignId,
  jobListingId,
  profile,
  campaign,
  answersJson,
}: {
  applicationId: string;
  jobListingUrl: string;
  campaignId: string;
  jobListingId: string;
  profile: ProfileData;
  campaign: CampaignData;
  answersJson: AnswersJson;
}): Promise<SubmitResult> {
  let screenshotPath: string | null = null;

  try {
    const session = await launchManagedBrowser();
    const page = session.page;

    // Step 1: Log submit requested
    await writeAutomationLog({
      campaignId,
      jobListingId,
      event: "application.submit_requested",
      message: `Submit lamaran ${applicationId} diminta oleh user. Membuka halaman lowongan...`,
      metadata: { applicationId, jobUrl: jobListingUrl },
    });

    // Step 2: Navigate to job page
    await page.goto(jobListingUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Step 3: Check for manual intervention
    const intervention = await detectManualIntervention(page);
    if (intervention.detected && intervention.reason) {
      screenshotPath = await saveScreenshot(page, "intervention", applicationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "warn",
        event: "application.submit_manual_intervention",
        message: `Intervensi manual terdeteksi saat submit: ${intervention.details ?? intervention.reason}`,
        metadata: { reason: intervention.reason, details: intervention.details ?? null, screenshotPath },
      });

      // Update application to paused
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "paused", screenshotPath },
      });

      return {
        status: "paused",
        message: "Submit dijeda karena Jobstreet meminta login/verifikasi manual.",
        screenshotPath: screenshotPath ?? undefined,
      };
    }

    // Step 4: Try to click apply button if not already on form
    // Check if there's already a form visible, if not try to open apply
    const hasForm = (await page.locator("form, [role='form'], [class*='form']").count()) > 0;
    if (!hasForm) {
      const applyFound = await findAndClickApplyButton(page);
      if (applyFound) {
        await page.waitForTimeout(3000);
      }
    }

    // Step 5: Re-check intervention after potential apply click
    const intervention2 = await detectManualIntervention(page);
    if (intervention2.detected && intervention2.reason) {
      screenshotPath = await saveScreenshot(page, "intervention_post_apply", applicationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "warn",
        event: "application.submit_manual_intervention",
        message: `Intervensi manual terdeteksi setelah klik apply: ${intervention2.details ?? intervention2.reason}`,
        metadata: { reason: intervention2.reason, details: intervention2.details ?? null, screenshotPath },
      });

      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "paused", screenshotPath },
      });

      return {
        status: "paused",
        message: "Submit dijeda karena Jobstreet meminta login/verifikasi manual.",
        screenshotPath: screenshotPath ?? undefined,
      };
    }

    // Step 6: Re-fill fields if needed (defensive)
    await fillKnownApplicationFields(page, profile, {
      currentSalary: campaign.defaultCurrentSalary,
      expectedSalary: campaign.defaultExpectedSalary,
      noticePeriod: campaign.defaultNoticePeriod,
      availability: campaign.defaultAvailability,
    });

    // Step 7: Check for unknown required questions
    const currentQuestions = await detectFormQuestions(page);
    const answeredQuestions = new Set(
      answersJson.questionAnswers.map((qa) => normalizeQuestion(qa.question)),
    );
    const pendingQuestions = new Set(
      answersJson.pendingQuestions.map((pq) => normalizeQuestion(pq.question)),
    );

    const unknownQuestions: string[] = [];
    for (const q of currentQuestions) {
      const norm = normalizeQuestion(q);
      if (!answeredQuestions.has(norm) && !pendingQuestions.has(norm)) {
        // Check if it's a known field label
        let isField = false;
        for (const f of answersJson.fieldsFilled) {
          if (norm.includes(normalizeQuestion(f.label)) || normalizeQuestion(f.label).includes(norm)) {
            isField = true;
            break;
          }
        }
        if (!isField && q.length > 3) {
          unknownQuestions.push(q);
        }
      }
    }

    if (unknownQuestions.length > 0) {
      screenshotPath = await saveScreenshot(page, "unknown_questions", applicationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "warn",
        event: "application.submit_manual_intervention",
        message: `Ditemukan ${unknownQuestions.length} pertanyaan baru yang belum diketahui jawabannya.`,
        metadata: { unknownQuestions, screenshotPath },
      });

      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "paused", screenshotPath },
      });

      return {
        status: "paused",
        message: `Submit dijeda: ditemukan ${unknownQuestions.length} pertanyaan baru yang belum dijawab.`,
        screenshotPath: screenshotPath ?? undefined,
      };
    }

    // Step 8: Pre-submit screenshot and log
    screenshotPath = await saveScreenshot(page, "before_submit", applicationId);

    await writeAutomationLog({
      campaignId,
      jobListingId,
      event: "application.before_submit_review",
      message: `Screenshot sebelum submit disimpan. Mencari tombol submit yang aman...`,
      metadata: { screenshotPath, applicationId },
    });

    // Step 9: Find and click submit button (safe matching)
    const submitCandidatesBefore = await page
      .locator("button, input[type='submit'], input[type='button'], a[role='button']")
      .evaluateAll((elements) =>
        elements
          .map((el) => ({
            text: ((el.textContent || (el as HTMLInputElement).value || "").trim()),
            type: (el.getAttribute("type") || "").trim(),
            tag: el.tagName.toLowerCase(),
          }))
          .filter((item) => item.text.length > 0)
          .slice(0, 20),
      )
      .catch(() => [] as Array<{ text: string; type: string; tag: string }>);

    await writeAutomationLog({
      campaignId,
      jobListingId,
      event: "application.submit_candidates_detected",
      message: `Kandidat tombol submit terdeteksi sebelum klik: ${submitCandidatesBefore.length}`,
      metadata: {
        applicationId,
        currentUrl: page.url(),
        submitCandidates: submitCandidatesBefore,
      },
    });

    const submitClicked = await findAndClickSafeSubmitButton(page);

    if (!submitClicked) {
      screenshotPath = await saveScreenshot(page, "submit_not_found", applicationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "error",
        event: "application.submit_failed",
        message: "Tombol submit final yang aman tidak ditemukan di halaman.",
        metadata: { screenshotPath, currentUrl: page.url(), submitCandidates: submitCandidatesBefore },
      });

      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "failed", screenshotPath },
      });

      return {
        status: "failed",
        message: "Tombol submit tidak ditemukan atau tidak dapat diklik dengan aman.",
        screenshotPath: screenshotPath ?? undefined,
      };
    }

    // Step 10: Wait for response and verify actual submit success
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(2500);

    const afterClickScreenshot = await saveScreenshot(page, "after_submit_click", applicationId);
    const pageText = (await page.textContent("body").catch(() => ""))?.toLowerCase() ?? "";
    const currentUrlAfterClick = page.url();
    const visibleConfirmationText = pageText.slice(0, 2000);
    const submitSuccessDetected = SUBMIT_SUCCESS_MARKERS.some((marker) => pageText.includes(marker));
    const submitButtonStillVisible = await page
      .locator("button, input[type='submit'], input[type='button'], a[role='button']")
      .evaluateAll((elements, labels) =>
        elements.some((el) => {
          const text = ((el.textContent || (el as HTMLInputElement).value || "").trim().toLowerCase());
          const visible = !(el as HTMLElement).hasAttribute("disabled")
            && ((el as HTMLElement).offsetParent !== null || getComputedStyle(el as HTMLElement).position === "fixed");
          return visible && (labels as string[]).some((label) => text === label || text.includes(label));
        }),
        ALLOWED_SUBMIT_LABELS,
      )
      .catch(() => false);

    await writeAutomationLog({
      campaignId,
      jobListingId,
      event: "application.submit_post_click_diagnostics",
      message: "Diagnostik setelah klik submit berhasil dikumpulkan.",
      metadata: {
        applicationId,
        screenshotPath: afterClickScreenshot,
        currentUrl: currentUrlAfterClick,
        submitSuccessDetected,
        submitButtonStillVisible,
        visibleConfirmationText,
      },
    });

    // Check for post-submit intervention
    const postSubmitIntervention = await detectManualIntervention(page);
    if (postSubmitIntervention.detected) {
      screenshotPath = await saveScreenshot(page, "post_submit_intervention", applicationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "warn",
        event: "application.submit_manual_intervention",
        message: `Intervensi terdeteksi setelah klik submit: ${postSubmitIntervention.details ?? postSubmitIntervention.reason}`,
        metadata: { screenshotPath },
      });

      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "paused", screenshotPath },
      });

      return {
        status: "paused",
        message: "Submit dijeda: Jobstreet meminta verifikasi setelah klik submit.",
        screenshotPath: screenshotPath ?? undefined,
      };
    }

    if (!submitSuccessDetected || submitButtonStillVisible) {
      screenshotPath = await saveScreenshot(page, "submit_unverified", applicationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "warn",
        event: "application.submit_unverified",
        message: "Klik submit mungkin sudah dilakukan, tetapi sistem belum bisa memverifikasi. Periksa browser.",
        metadata: {
          applicationId,
          screenshotPath,
          currentUrl: currentUrlAfterClick,
          submitButtonStillVisible,
          visibleConfirmationText,
        },
      });

      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "paused",
          screenshotPath,
          notes: "Klik submit mungkin sudah dilakukan, tetapi sistem belum bisa memverifikasi. Periksa browser.",
        },
      });

      return {
        status: "paused",
        message: "Klik submit mungkin sudah dilakukan, tetapi sistem belum bisa memverifikasi. Periksa browser.",
        screenshotPath: screenshotPath ?? undefined,
      };
    }

    // Step 11: Capture success screenshot
    screenshotPath = await saveScreenshot(page, "after_submit", applicationId);

    await writeAutomationLog({
      campaignId,
      jobListingId,
      event: "application.submitted",
      message: `Lamaran berhasil dikirim untuk "${jobListingUrl}".`,
      metadata: { applicationId, screenshotPath, currentUrl: page.url() },
    });

    return {
      status: "submitted",
      message: "Lamaran berhasil dikirim.",
      screenshotPath: screenshotPath ?? undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await writeAutomationLog({
      campaignId,
      jobListingId,
      level: "error",
      event: "application.submit_failed",
      message: `Gagal submit lamaran: ${errorMessage}`,
      metadata: { applicationId, error: errorMessage },
    });

    return {
      status: "failed",
      message: `Gagal submit lamaran: ${errorMessage}`,
      error: errorMessage,
      screenshotPath: screenshotPath ?? undefined,
    };
  }
}

// ── Safe Submit Button Finder ─────────────────────────────────────────

async function findAndClickSafeSubmitButton(page: Page): Promise<boolean> {
  const reviewAreaSelectors = [
    "form",
    "main form",
    "[role='form']",
    "[data-automation*='review' i]",
    "[data-automation*='application' i]",
    "[class*='review' i]",
    "[class*='application' i]",
  ];

  const exactPriorityLabels = ["submit application", "kirim lamaran"];
  const genericSelectors = [
    "button",
    "button[type='submit']",
    "input[type='submit']",
    "input[type='button']",
    "a[role='button']",
    "[data-automation*='submit' i]",
  ];

  async function tryClickCandidate(rootSelector?: string) {
    for (const selector of genericSelectors) {
      const scopedSelector = rootSelector ? `${rootSelector} ${selector}` : selector;
      try {
        const elements = page.locator(scopedSelector);
        const count = await elements.count();

        for (let i = 0; i < Math.min(count, 20); i++) {
          const el = elements.nth(i);
          try {
            if (!(await el.isVisible()) || (await el.isDisabled())) continue;

            const text = (((await el.textContent()) ?? (await el.getAttribute("value")) ?? "").toLowerCase().trim());
            if (!text) continue;

            const isAllowed = ALLOWED_SUBMIT_LABELS.some((label) => text === label || text.includes(label));
            const isBlocked = BLOCKED_SUBMIT_LABELS.some((label) => text.includes(label));
            if (!isAllowed || isBlocked) continue;

            const roleHint = await el.evaluate((node) => {
              const parentText = (node.parentElement?.textContent || "").toLowerCase();
              const ancestorText = (node.closest("form, main, section, article")?.textContent || "").toLowerCase();
              return `${parentText} ${ancestorText}`;
            }).catch(() => "");

            if (rootSelector) {
              await el.click();
              return true;
            }

            if (roleHint.includes("submit") || roleHint.includes("review") || roleHint.includes("application") || roleHint.includes("lamaran")) {
              await el.click();
              return true;
            }
          } catch {
            // Try next candidate
          }
        }
      } catch {
        // Try next selector
      }
    }

    return false;
  }

  for (const label of exactPriorityLabels) {
    for (const area of reviewAreaSelectors) {
      try {
        const exactButton = page.locator(`${area} button`).filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") }).first();
        if ((await exactButton.count()) > 0 && (await exactButton.isVisible()) && !(await exactButton.isDisabled())) {
          await exactButton.click();
          return true;
        }
      } catch {
        // Try next area
      }
    }
  }

  for (const area of reviewAreaSelectors) {
    if (await tryClickCandidate(area)) {
      return true;
    }
  }

  if (await tryClickCandidate()) {
    return true;
  }

  return false;
}

async function clickSafeContinueButton(page: Page): Promise<{ clicked: boolean; label?: string }> {
  const selectors = [
    "button",
    "input[type='button']",
    "input[type='submit']",
    "a[role='button']",
  ];

  for (const selector of selectors) {
    try {
      const elements = page.locator(selector);
      const count = await elements.count();
      for (let i = 0; i < Math.min(count, 30); i++) {
        const el = elements.nth(i);
        try {
          if (!(await el.isVisible()) || (await el.isDisabled())) continue;
          const text = (((await el.textContent()) ?? (await el.getAttribute("value")) ?? "")).toLowerCase().trim();
          if (!text) continue;

          const isContinue = CONTINUE_LABELS.some((label) => text.includes(label));
          const isBlockedSubmit = ALLOWED_SUBMIT_LABELS.some((label) => text.includes(label))
            && !BLOCKED_SUBMIT_LABELS.some((label) => text.includes(label));
          if (!isContinue || isBlockedSubmit) continue;

          await el.click();
          await page.waitForTimeout(2500);
          return { clicked: true, label: text.substring(0, 200) };
        } catch {
          // Try next
        }
      }
    } catch {
      // Try next selector group
    }
  }

  return { clicked: false };
}

// ── Apply Button Finder ────────────────────────────────────────────────

async function findAndClickApplyButton(page: Page): Promise<boolean> {
  // Strategy 1: Text-based button/link matching
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
        await el.click();
        return true;
      }
    } catch {
      // Try next
    }
  }

  // Strategy 2: data-automation attribute
  const automationSelectors = [
    "[data-automation*='apply' i]",
    "[data-automation*='lamar' i]",
    "[data-testid*='apply' i]",
    "[data-testid*='lamar' i]",
  ];

  for (const selector of automationSelectors) {
    try {
      const el = page.locator(selector).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        await el.click();
        return true;
      }
    } catch {
      // Try next
    }
  }

  // Strategy 3: href containing apply
  try {
    const el = page.locator("a[href*='apply' i], a[href*='lamar' i]").first();
    if ((await el.count()) > 0 && (await el.isVisible())) {
      await el.click();
      return true;
    }
  } catch {
    // Continue
  }

  // Strategy 4: Generic fallback - look for prominent CTA buttons
  try {
    const buttons = page.locator("button, a[role='button']");
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 20); i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const text = (await btn.textContent())?.toLowerCase().trim() ?? "";
        if (
          text.includes("lamar") ||
          text.includes("apply") ||
          text.includes("daftar") ||
          text.includes("register")
        ) {
          await btn.click();
          return true;
        }
      }
    }
  } catch {
    // Continue
  }

  return false;
}
