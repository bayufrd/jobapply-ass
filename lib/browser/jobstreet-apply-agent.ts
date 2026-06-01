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

    // Step 8: Detect and answer questions
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

    // Step 9: Detect submit button and STOP before clicking
    const submitSelector = await detectSubmitButton(page);
    const hasPendingQuestions = pendingQuestions.length > 0;

    // Step 10: Determine status
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
    } else {
      appStatus = "pending_review";
      notes = `Form lamaran sudah disiapkan. ${filledCount} field diisi, ${questionAnswers.length} pertanyaan dijawab. Menunggu review user.`;
    }

    if (submitSelector) {
      notes += " Tombol submit terdeteksi tetapi TIDAK diklik (menunggu approval user).";
    }

    // Step 11: Create Application record
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
      event: "application.review_required",
      message: `Form lamaran sudah disiapkan dan menunggu review user. Status: ${appStatus}`,
      metadata: {
        applicationId: app.id,
        fieldsFilled: filledCount,
        questionsAnswered: questionAnswers.length,
        pendingQuestions: pendingQuestions.length,
        submitDetected: !!submitSelector,
      },
    });

    return {
      status: appStatus,
      message: hasPendingQuestions
        ? `Ada ${pendingQuestions.length} pertanyaan yang memerlukan jawaban Anda. ${filledCount} field sudah diisi otomatis.`
        : "Form lamaran sudah disiapkan dan menunggu review user.",
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
