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

type CampaignData = {
  id: string;
  name: string;
  submitMode: string;
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
  status: "pending_review" | "paused" | "failed";
  message: string;
  applicationId?: string;
  error?: string;
};

type SubmitResult = {
  status: "submitted" | "failed" | "paused";
  message: string;
  screenshotPath?: string;
  error?: string;
};

// Allowed submit button labels (safe matching)
const ALLOWED_SUBMIT_LABELS = [
  "kirim",
  "submit",
  "submit application",
  "kirim lamaran",
  "lamar sekarang",
  "apply",
  "apply now",
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
  "keep it up",
  "your application has been sent",
  "application has been sent",
  "lamaran berhasil dikirim",
  "application sent",
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

// ── Main ───────────────────────────────────────────────────────────────

export async function startJobApplication({
  jobListing,
  campaign,
  profile,
}: {
  jobListing: JobListingData;
  campaign: CampaignData;
  profile: ProfileData;
}): Promise<ApplyResult> {
  const session = await launchManagedBrowser();
  const page = session.page;
  let applicationId: string | null = null;

  try {
    // Step 1: Open job detail page
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "application.job_opened",
      message: `Membuka halaman lowongan: ${jobListing.url}`,
    });

    await page.goto(jobListing.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Step 2: Detect manual intervention on page load
    const intervention1 = await checkAndHandleIntervention(
      page, jobListing.id, campaign.id, "halaman_lowongan",
    );
    if (intervention1) return intervention1;

    // Step 3: Find apply button
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "application.searching_apply_button",
      message: "Mencari tombol lamar...",
    });

    const applyButtonFound = await findAndClickApplyButton(page);

    if (!applyButtonFound) {
      const app = await prisma.application.create({
        data: {
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          status: "failed",
          submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
          notes: "Tombol lamar tidak ditemukan di halaman lowongan.",
        },
      });
      applicationId = app.id;

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        level: "error",
        event: "application.apply_button_not_found",
        message: "Tombol lamar tidak ditemukan di halaman lowongan.",
      });

      return {
        status: "failed",
        message: "Tombol lamar tidak ditemukan di halaman lowongan. Kemungkinan lowongan sudah ditutup atau format halaman berubah.",
        applicationId: app.id,
      };
    }

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "application.apply_button_clicked",
      message: "Tombol lamar berhasil diklik.",
    });

    // Step 4: Wait for form/modal/page to load
    await page.waitForTimeout(3000);

    // Step 5: Detect manual intervention after clicking apply
    const intervention2 = await checkAndHandleIntervention(
      page, jobListing.id, campaign.id, "setelah_klik_apply",
    );
    if (intervention2) return intervention2;

    // Step 6: Detect form
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "application.form_detected",
      message: "Form lamaran terdeteksi.",
    });

    // Step 7: Fill known fields
    const filledFields = await fillKnownApplicationFields(page, profile, {
      currentSalary: campaign.defaultCurrentSalary,
      expectedSalary: campaign.defaultExpectedSalary,
      noticePeriod: campaign.defaultNoticePeriod,
      availability: campaign.defaultAvailability,
    });

    const filledCount = filledFields.filter((f) => f.filled).length;
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "application.field_filled",
      message: `${filledCount} field berhasil diisi dari ${filledFields.length} field yang terdeteksi.`,
      metadata: { fields: filledFields },
    });

    // Step 8: Safely continue internal multi-step flow before final review
    await traverseInternalApplySteps(page);

    // Step 9: Detect and answer questions on the final/current review step
    const questionTexts = await detectFormQuestions(page);
    const questionAnswers: AnswersJson["questionAnswers"] = [];
    const pendingQuestions: AnswersJson["pendingQuestions"] = [];

    // Filter out questions that correspond to already-filled fields
    const alreadyFilledLabels = new Set(
      filledFields.filter((f) => f.filled).map((f) => normalizeQuestion(f.label)),
    );

    const candidateProfile = buildCandidateProfile(profile);

    for (const questionText of questionTexts) {
      const normalized = normalizeQuestion(questionText);

      // Skip if this question matches an already-filled field
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
        metadata: { question: questionText },
      });

      // Check QuestionMemory first
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

        // Update usage count
        await prisma.questionMemory.update({
          where: { id: memory.id },
          data: { usageCount: { increment: 1 } },
        });

        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "application.question_answered",
          message: `Pertanyaan dijawab dari memori: "${questionText}" → "${memory.answer}"`,
          metadata: { question: questionText, answer: memory.answer, source: "memory", confidence: memory.confidence },
        });
        continue;
      }

      // Use AI to answer
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

          // Save to QuestionMemory
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

          await writeAutomationLog({
            campaignId: campaign.id,
            jobListingId: jobListing.id,
            event: "application.question_answered",
            message: `Pertanyaan dijawab oleh AI: "${questionText}" → "${aiResult.answer}"`,
            metadata: { question: questionText, answer: aiResult.answer, source: "ai", confidence: aiResult.confidence },
          });
        } else {
          // Low confidence or requires review
          pendingQuestions.push({
            question: questionText,
            reason: aiResult.requiresHumanReview
              ? "Memerlukan review manual dari user."
              : `Confidence rendah (${Math.round(aiResult.confidence * 100)}%).`,
          });

          await writeAutomationLog({
            campaignId: campaign.id,
            jobListingId: jobListing.id,
            level: "warn",
            event: "application.question_needs_user_input",
            message: `Pertanyaan memerlukan input user: "${questionText}" (confidence: ${Math.round(aiResult.confidence * 100)}%)`,
            metadata: { question: questionText, aiResult },
          });
        }
      } catch (error) {
        pendingQuestions.push({
          question: questionText,
          reason: `Gagal mendapatkan jawaban AI: ${error instanceof Error ? error.message : String(error)}`,
        });

        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          level: "error",
          event: "application.question_needs_user_input",
          message: `Gagal menjawab pertanyaan: "${questionText}"`,
          metadata: { question: questionText, error: String(error) },
        });
      }
    }

    // Step 10: Detect submit button and STOP before clicking
    const submitSelector = await detectSubmitButton(page);
    const hasPendingQuestions = pendingQuestions.length > 0;
    const reachedFinalReview = Boolean(submitSelector);

    // Step 11: Determine status
    const answersJson: AnswersJson = {
      fieldsFilled: filledFields,
      questionAnswers,
      pendingQuestions,
    };

    let appStatus: "pending_review" | "paused";
    let notes: string;

    if (hasPendingQuestions) {
      appStatus = "paused";
      notes = `Ada ${pendingQuestions.length} pertanyaan yang memerlukan input user. ${filledCount} field berhasil diisi.`;
    } else if (!reachedFinalReview) {
      appStatus = "paused";
      notes = `Form lamaran belum mencapai halaman review final Jobstreet. ${filledCount} field diisi, ${questionAnswers.length} pertanyaan dijawab. Lanjutkan sampai tombol Submit application terlihat.`;
    } else {
      appStatus = "pending_review";
      notes = `Form lamaran sudah mencapai halaman review final. ${filledCount} field diisi, ${questionAnswers.length} pertanyaan dijawab. Menunggu review user.`;
    }

    if (submitSelector) {
      notes += " Tombol submit terdeteksi tetapi TIDAK diklik (menunggu approval user).";
    }

    // Step 12: Create Application record
    const app = await prisma.application.create({
      data: {
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        status: appStatus,
        submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
        notes,
        answersJson: JSON.stringify(answersJson),
      },
    });
    applicationId = app.id;

    // Update JobListing status
    await prisma.jobListing.update({
      where: { id: jobListing.id },
      data: { status: "applying" },
    });

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: reachedFinalReview ? "application.review_required" : "application.form_not_ready",
      message: reachedFinalReview
        ? `Form lamaran sudah mencapai review final dan menunggu review user. Status: ${appStatus}`
        : `Form lamaran belum mencapai review final Jobstreet. Status: ${appStatus}`,
      metadata: {
        applicationId: app.id,
        fieldsFilled: filledCount,
        questionsAnswered: questionAnswers.length,
        pendingQuestions: pendingQuestions.length,
        submitDetected: !!submitSelector,
        reachedFinalReview,
      },
    });

    return {
      status: appStatus,
      message: hasPendingQuestions
        ? `Ada ${pendingQuestions.length} pertanyaan yang memerlukan jawaban Anda. ${filledCount} field sudah diisi otomatis.`
        : reachedFinalReview
          ? "Form lamaran sudah mencapai review final dan menunggu review user."
          : "Form lamaran belum mencapai review final Jobstreet. Lanjutkan sampai tombol Submit application terlihat.",
      applicationId: app.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Try to create failed Application record
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
  // Browser intentionally left open for manual review
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
    const submitClicked = await findAndClickSafeSubmitButton(page);

    if (!submitClicked) {
      screenshotPath = await saveScreenshot(page, "submit_not_found", applicationId);

      await writeAutomationLog({
        campaignId,
        jobListingId,
        level: "error",
        event: "application.submit_failed",
        message: "Tombol submit yang aman tidak ditemukan di halaman.",
        metadata: { screenshotPath },
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

    const pageText = (await page.textContent("body").catch(() => ""))?.toLowerCase() ?? "";
    const submitSuccessDetected = SUBMIT_SUCCESS_MARKERS.some((marker) => pageText.includes(marker));
    const submitButtonStillVisible = await page
      .locator("button, input[type='submit'], input[type='button'], a[role='button']")
      .evaluateAll((elements, labels) =>
        elements.some((el) => {
          const text = ((el.textContent || (el as HTMLInputElement).value || "").trim().toLowerCase());
          const visible = !(el as HTMLElement).hasAttribute("disabled")
            && ((el as HTMLElement).offsetParent !== null || getComputedStyle(el as HTMLElement).position === "fixed");
          return visible && (labels as string[]).some((label) => text.includes(label));
        }),
        ALLOWED_SUBMIT_LABELS,
      )
      .catch(() => false);

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
        message: "Klik submit sudah dilakukan, tetapi halaman konfirmasi sukses Jobstreet belum terverifikasi atau tombol submit masih terlihat.",
        metadata: { applicationId, screenshotPath, currentUrl: page.url(), submitButtonStillVisible },
      });

      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "paused",
          screenshotPath,
          notes: "Submit belum diverifikasi oleh sistem. Periksa halaman browser yang terbuka.",
        },
      });

      return {
        status: "paused",
        message: "Submit belum dapat diverifikasi dari halaman konfirmasi Jobstreet atau tombol submit masih terlihat. Periksa browser visible.",
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
  // Strategy 1: Submit type buttons
  const typeSubmitSelectors = [
    "button[type='submit']",
    "input[type='submit']",
  ];

  for (const selector of typeSubmitSelectors) {
    try {
      const el = page.locator(selector).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        const text = ((await el.textContent()) ?? (await el.getAttribute("value")) ?? "").toLowerCase().trim();
        // Verify it's not a blocked label
        const isBlocked = BLOCKED_SUBMIT_LABELS.some((b) => text.includes(b));
        if (!isBlocked) {
          await el.click();
          return true;
        }
      }
    } catch {
      // Try next
    }
  }

  // Strategy 2: Text-based matching with allowed labels
  for (const label of ALLOWED_SUBMIT_LABELS) {
    try {
      const el = page.locator(`button:has-text('${label}')`).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        const text = ((await el.textContent()) ?? "").toLowerCase().trim();
        const isBlocked = BLOCKED_SUBMIT_LABELS.some((b) => text.includes(b));
        if (!isBlocked) {
          await el.click();
          return true;
        }
      }
    } catch {
      // Try next
    }
  }

  // Strategy 3: data-automation submit
  try {
    const el = page.locator("[data-automation*='submit' i]").first();
    if ((await el.count()) > 0 && (await el.isVisible())) {
      const text = ((await el.textContent()) ?? "").toLowerCase().trim();
      const isBlocked = BLOCKED_SUBMIT_LABELS.some((b) => text.includes(b));
      if (!isBlocked) {
        await el.click();
        return true;
      }
    }
  } catch {
    // Continue
  }

  // Strategy 4: Generic submit button in form context
  try {
    const formButtons = page.locator("form button[type='submit'], form [role='button'][type='submit']");
    const count = await formButtons.count();
    for (let i = 0; i < count; i++) {
      const btn = formButtons.nth(i);
      if (await btn.isVisible()) {
        const text = ((await btn.textContent()) ?? "").toLowerCase().trim();
        const isBlocked = BLOCKED_SUBMIT_LABELS.some((b) => text.includes(b));
        if (!isBlocked) {
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

async function traverseInternalApplySteps(page: Page): Promise<void> {
  let lastFingerprint = "";
  let lastUrl = page.url();

  for (let step = 1; step <= 5; step++) {
    const currentQuestions = await detectFormQuestions(page).catch(() => [] as string[]);
    const currentButtons = await page
      .locator("button, input[type='submit'], input[type='button'], a[role='button']")
      .evaluateAll((elements) =>
        elements
          .map((el) => ((el.textContent || (el as HTMLInputElement).value || "").trim().toLowerCase()))
          .filter(Boolean)
          .slice(0, 20),
      )
      .catch(() => [] as string[]);

    const fingerprint = JSON.stringify({
      url: page.url(),
      questions: currentQuestions.slice(0, 20),
      buttons: currentButtons,
    });

    if (fingerprint === lastFingerprint) break;
    lastFingerprint = fingerprint;

    const nextResult = await clickSafeContinueButton(page);
    if (!nextResult.clicked) break;

    const currentUrl = page.url();
    if (currentUrl !== lastUrl) {
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
      lastUrl = currentUrl;
    }
  }
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
