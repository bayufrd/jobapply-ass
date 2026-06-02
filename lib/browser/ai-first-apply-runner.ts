import type { Page } from "playwright";
import { prisma } from "@/lib/db/prisma";
import { detectManualIntervention } from "@/lib/browser/page-detector";
import { detectJobstreetApplyStep } from "@/lib/browser/jobstreet-apply-step-detector";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { captureVisibleDomSnapshot, type DomSnapshot } from "@/lib/browser/dom-snapshot";
import { planUiNextActions } from "@/lib/ai/ui-action-planner";
import { executeUiActionPlan } from "@/lib/browser/ui-action-executor";
import { answerApplicationQuestion } from "@/lib/ai/question-answerer";
import type { CandidateProfileResult, QuestionAnswerResult } from "@/lib/ai/schemas";
import {
  capturePageSignature,
  createWatchdogRuntime,
  isSamePageSignature,
  logWatchdogEvent,
} from "@/lib/browser/apply-watchdog";

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

const MAX_STEPS_PER_JOB = 30;
const MAX_NO_PROGRESS = 3;
const MAX_AI_RETRIES = 2;
const MAX_JOB_DURATION_MS = 5 * 60 * 1000;

type SubmitModeStrategy = "review_each_application" | "auto_submit_safe_only";

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
  status: "submitted" | "pending_review" | "paused" | "failed" | "apply_unavailable" | "stuck_no_progress" | "submit_not_found_timeout";
  message: string;
  applicationId?: string;
  error?: string;
  screenshotPath?: string;
};

type AnswersJson = {
  fieldsFilled: Array<{ selector: string; label: string; value: string; filled: boolean }>;
  questionAnswers: Array<{
    question: string;
    answer: string;
    confidence: number;
    source: string;
    evidence?: string[];
  }>;
  pendingQuestions: Array<{
    question: string;
    reason: string;
    suggestedAnswer?: string;
    confidence?: number;
    evidence?: string[];
    answerOptions?: string[];
  }>;
  aiUi?: {
    lastGoal?: string;
    lastReason?: string;
    lastTargetElementId?: string | null;
    lastSnapshotSummary?: string;
    history?: Array<{ step: number; goal: string; reason?: string | null }>;
  };
};

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function buildCandidateProfile(profile: ProfileData): CandidateProfileResult {
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

function normalizeQuestion(text: string) {
  return text.toLowerCase().replace(/[?.,!:;]+/g, "").replace(/\s+/g, " ").trim();
}

function fingerprintSnapshot(snapshot: DomSnapshot) {
  return JSON.stringify({
    url: snapshot.currentUrl,
    title: snapshot.pageTitle,
    count: snapshot.elements.length,
    fields: snapshot.elements.slice(0, 12).map((element) => ({
      id: element.elementId,
      text: element.text,
      label: element.label,
      valuePreview: element.valuePreview,
      checked: element.checked,
      selected: element.selected,
    })),
  });
}

async function verifySubmitSuccess(page: Page) {
  const pageText = (await page.textContent("body").catch(() => ""))?.toLowerCase() ?? "";
  const submitSuccessDetected = SUBMIT_SUCCESS_MARKERS.some((marker) => pageText.includes(marker));

  return {
    submitSuccessDetected,
    visibleConfirmationText: pageText.slice(0, 2000),
    currentUrl: page.url(),
  };
}

async function getQuestionMemory() {
  const memories = await prisma.questionMemory.findMany({
    orderBy: [{ confidence: "desc" }, { usageCount: "desc" }],
    take: 40,
  });

  return memories.map((memory) => ({
    question: memory.questionRaw,
    answer: memory.answer,
    confidence: memory.confidence,
    source: memory.source,
  }));
}

async function createPausedApplication(params: {
  campaign: CampaignData;
  jobListing: JobListingData;
  note: string;
  answersJson: AnswersJson;
}) {
  return prisma.application.create({
    data: {
      campaignId: params.campaign.id,
      jobListingId: params.jobListing.id,
      status: "paused",
      submitMode: params.campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
      notes: params.note,
      answersJson: JSON.stringify(params.answersJson),
    },
  });
}

async function createReviewApplication(params: {
  campaign: CampaignData;
  jobListing: JobListingData;
  note: string;
  answersJson: AnswersJson;
}) {
  return prisma.application.create({
    data: {
      campaignId: params.campaign.id,
      jobListingId: params.jobListing.id,
      status: "pending_review",
      submitMode: params.campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
      notes: params.note,
      answersJson: JSON.stringify(params.answersJson),
    },
  });
}

async function markSubmitted(params: {
  campaign: CampaignData;
  jobListing: JobListingData;
  note: string;
  answersJson: AnswersJson;
}) {
  const application = await prisma.application.create({
    data: {
      campaignId: params.campaign.id,
      jobListingId: params.jobListing.id,
      status: "submitted",
      submitMode: params.campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
      notes: params.note,
      answersJson: JSON.stringify(params.answersJson),
      submittedAt: new Date(),
      userApproved: true,
    },
  });

  await prisma.jobListing.update({ where: { id: params.jobListing.id }, data: { status: "submitted" } });
  await prisma.campaign.update({ where: { id: params.campaign.id }, data: { appliedCount: { increment: 1 } } });

  return application;
}

async function maybeAnswerQuestionFromMemoryOrAi(params: {
  question: string;
  profile: CandidateProfileResult;
  campaign: CampaignData;
}) {
  const normalized = normalizeQuestion(params.question);
  const memory = await prisma.questionMemory.findFirst({
    where: { questionNormalized: normalized, confidence: { gte: 0.7 } },
    orderBy: { confidence: "desc" },
  });

  if (memory) {
    return {
      answer: memory.answer,
      confidence: memory.confidence,
      source: "memory",
      evidence: ["Jawaban serupa ditemukan di memori pertanyaan."],
      requiresHumanReview: false,
    };
  }

  const aiResult: QuestionAnswerResult = await answerApplicationQuestion({
    question: params.question,
    candidateProfile: params.profile,
    campaignDefaults: {
      currentSalary: params.campaign.defaultCurrentSalary,
      expectedSalary: params.campaign.defaultExpectedSalary,
      noticePeriod: params.campaign.defaultNoticePeriod,
      availability: params.campaign.defaultAvailability,
    },
  });

  return {
    answer: aiResult.answer,
    confidence: aiResult.confidence,
    source: "ai",
    evidence: aiResult.evidence,
    requiresHumanReview: aiResult.requiresHumanReview,
  };
}

export async function runAiFirstApplyRunner({
  page,
  jobListing,
  campaign,
  candidateProfile,
  mode,
}: {
  page: Page;
  jobListing: JobListingData;
  campaign: CampaignData;
  candidateProfile: ProfileData;
  mode: SubmitModeStrategy;
}): Promise<ApplyResult> {
  const profile = buildCandidateProfile(candidateProfile);
  const questionMemory = await getQuestionMemory();
  const watchdog = createWatchdogRuntime();
  let previousFingerprint: string | null = null;
  let aiRetryCount = 0;
  let applicationId: string | undefined;

  const answersJson: AnswersJson = {
    fieldsFilled: [],
    questionAnswers: [],
    pendingQuestions: [],
    aiUi: { history: [] },
  };

  const createStuckResult = async (status: "apply_unavailable" | "stuck_no_progress" | "submit_not_found_timeout", message: string) => {
    await prisma.jobListing.update({ where: { id: jobListing.id }, data: { status: status as never } });
    return { status, message, applicationId } as ApplyResult;
  };

  for (let step = 1; step <= MAX_STEPS_PER_JOB; step += 1) {
    watchdog.startStep({
      key: `ai_first_step_${step}`,
      label: "AI membaca form",
      nextAutomaticAction: "AI membaca form lalu memilih aksi aman.",
    });

    await logWatchdogEvent({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "application.step_timer_started",
      message: `AI membaca form — ${watchdog.getStatus().stepElapsedSeconds}/${watchdog.getStatus().maxStepSeconds} detik.`,
      metadata: { step, watchdog: watchdog.getStatus() },
    });

    if (watchdog.shouldTimeoutJob()) {
      const failed = await prisma.application.create({
        data: {
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          status: "failed",
          submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
          notes: "Batas total 3 menit per lowongan tercapai.",
          answersJson: JSON.stringify(answersJson),
        },
      });
      return { status: "failed", message: "Batas total 3 menit per lowongan tercapai.", applicationId: failed.id };
    }

    const beforeSignature = await capturePageSignature(page).catch(() => null);
    const snapshot = await captureVisibleDomSnapshot(page);
    const snapshotFingerprint = fingerprintSnapshot(snapshot);
    const snapshotSummary = snapshot.visibleTextSummary.slice(0, 500);

    if (previousFingerprint === snapshotFingerprint) {
      watchdog.recordNoProgress(beforeSignature ?? watchdog.getLastSignature()!);
      await logWatchdogEvent({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        level: "warn",
        event: "application.no_progress_detected",
        message: `Tidak ada perubahan setelah aksi ke-${watchdog.getStatus().noProgressCount}.`,
        metadata: { step, watchdog: watchdog.getStatus() },
      });
    } else if (beforeSignature) {
      watchdog.recordProgress(beforeSignature);
    }
    previousFingerprint = snapshotFingerprint;

    if (watchdog.shouldTimeoutCurrentStep() || watchdog.shouldTriggerNoProgressFallback()) {
      await logWatchdogEvent({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        level: "warn",
        event: watchdog.shouldTriggerNoProgressFallback() ? "application.no_progress_limit_reached" : "application.step_timeout",
        message: watchdog.shouldTriggerNoProgressFallback()
          ? "Halaman tidak berubah setelah 2 aksi. AI fallback dicoba."
          : "Batas 8 detik pada langkah ini tercapai. AI fallback dicoba.",
        metadata: { step, watchdog: watchdog.getStatus(), snapshotSummary },
      });

      if (!watchdog.canUseAiFallback()) {
        return await createStuckResult("stuck_no_progress", "Halaman tidak berubah setelah 2 aksi. Lowongan dilewati.");
      }

      watchdog.markAiFallbackStarted();
      await logWatchdogEvent({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "application.ai_fallback_once_started",
        message: "AI fallback dicoba satu kali.",
        metadata: { step, intent: "What is the next safe action?", watchdog: watchdog.getStatus() },
      });
    }

    const pageText = (await page.textContent("body").catch(() => "")) ?? "";
    const detectedStep = detectJobstreetApplyStep(page.url(), pageText);

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "jobstreet_apply.step_detected_from_url",
      message: `Langkah Jobstreet dari URL terdeteksi: ${detectedStep}.`,
      metadata: { step: detectedStep, url: page.url() },
    });

    const intervention = await detectManualIntervention(page);
    if (intervention.detected && intervention.reasonCode && intervention.confidence >= 0.85) {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        level: "warn",
        event: "manual_intervention.confirmed",
        message: "Intervensi manual dengan bukti kuat terkonfirmasi.",
        metadata: {
          step: detectedStep,
          url: page.url(),
          type: intervention.type,
          confidence: intervention.confidence,
          evidence: intervention.evidence,
        },
      });
      const paused = await createPausedApplication({ campaign, jobListing, note: "Verifikasi manual terdeteksi", answersJson });
      applicationId = paused.id;
      return { status: "paused", message: "Jobstreet meminta login/verifikasi keamanan. Selesaikan di browser yang terbuka, lalu klik Lanjutkan.", applicationId };
    }

    if (intervention.detected) {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        level: "warn",
        event: "manual_intervention.candidate_detected",
        message: "Kandidat intervensi manual terdeteksi tetapi belum cukup kuat untuk pause.",
        metadata: {
          step: detectedStep,
          url: page.url(),
          type: intervention.type,
          confidence: intervention.confidence,
          evidence: intervention.evidence,
        },
      });

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "manual_intervention.false_positive_rejected",
        message: "Deteksi intervensi manual lemah ditolak dan flow Jobstreet normal dilanjutkan.",
        metadata: { step: detectedStep, url: page.url(), evidence: intervention.evidence },
      });
    }

    if (detectedStep === "success") {
      const submitted = await markSubmitted({ campaign, jobListing, note: "Lamaran berhasil diverifikasi oleh URL success Jobstreet.", answersJson });
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "jobstreet_apply.success_detected",
        message: "Halaman success Jobstreet terdeteksi. Lamaran ditandai terkirim.",
        metadata: { url: page.url() },
      });
      return { status: "submitted", message: "Lamaran berhasil dikirim.", applicationId: submitted.id };
    }

    if (detectedStep === "choose_documents") {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "jobstreet_apply.choose_documents_continue",
        message: "Langkah memilih dokumen terdeteksi. Sistem mencoba klik Continue.",
        metadata: { url: page.url() },
      });
    }

    if (detectedStep === "employer_questions") {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "jobstreet_apply.employer_questions_started",
        message: "Langkah pertanyaan employer terdeteksi. AI mulai membaca field yang terlihat.",
        metadata: { url: page.url() },
      });
    }

    if (detectedStep === "update_profile") {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "jobstreet_apply.update_profile_started",
        message: "Langkah Update Jobstreet Profile terdeteksi. Sistem mulai memeriksa field wajib yang kosong.",
        metadata: { url: page.url() },
      });
    }

    if (detectedStep === "review_submit") {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "jobstreet_apply.review_submit_detected",
        message: "Langkah review dan submit Jobstreet terdeteksi.",
        metadata: { url: page.url() },
      });
    }

    const success = await verifySubmitSuccess(page);
    if (success.submitSuccessDetected) {
      const submitted = await markSubmitted({ campaign, jobListing, note: "Lamaran berhasil diverifikasi oleh AI-first apply runner.", answersJson });
      return { status: "submitted", message: "Lamaran berhasil dikirim.", applicationId: submitted.id };
    }

    const plan = await planUiNextActions({
      domSnapshot: snapshot,
      candidateProfile: profile,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        keyword: campaign.name,
        location: jobListing.location,
        defaultCurrentSalary: campaign.defaultCurrentSalary,
        defaultExpectedSalary: campaign.defaultExpectedSalary,
        defaultNoticePeriod: campaign.defaultNoticePeriod,
        defaultAvailability: campaign.defaultAvailability,
        workModePreference: campaign.workModePreference,
        formAutomationMode: campaign.formAutomationMode ?? "ai_first",
      },
      jobListing: {
        id: jobListing.id,
        title: jobListing.title,
        company: jobListing.company,
        location: jobListing.location,
        salaryText: jobListing.salaryText,
        workType: jobListing.workType,
        url: jobListing.url,
        description: jobListing.description,
      },
      questionMemory,
      currentApplicationState: {
        step,
        mode,
        previousGoal: answersJson.aiUi?.lastGoal ?? null,
        previousReason: answersJson.aiUi?.lastReason ?? null,
        repeatedFingerprintCount: watchdog.getStatus().noProgressCount,
        externalRedirect: !snapshot.currentUrl.includes("jobstreet") && !snapshot.currentUrl.includes("jobsdb"),
        wizardHistory: answersJson.aiUi?.history ?? [],
      },
      safetyMode: "strict",
    });

    answersJson.aiUi = {
      ...(answersJson.aiUi ?? {}),
      lastGoal: plan.goal,
      lastReason: plan.userFacingReason,
      lastTargetElementId: plan.actions[0]?.elementId ?? null,
      lastSnapshotSummary: snapshotSummary,
      history: [...(answersJson.aiUi?.history ?? []), { step, goal: plan.goal, reason: plan.userFacingReason }].slice(-12),
    };

    if (plan.goal === "ask_user") {
      const paused = await createPausedApplication({ campaign, jobListing, note: "Sistem membutuhkan keputusan Anda.", answersJson });
      applicationId = paused.id;
      return { status: "paused", message: "Sistem membutuhkan keputusan Anda.", applicationId };
    }

    if (plan.goal === "manual_intervention") {
      const paused = await createPausedApplication({ campaign, jobListing, note: "Verifikasi manual terdeteksi", answersJson });
      applicationId = paused.id;
      return { status: "paused", message: "Verifikasi manual terdeteksi", applicationId };
    }

    if (plan.goal === "skip_job") {
      return await createStuckResult("apply_unavailable", plan.userFacingReason || "Lowongan dilewati oleh AI.");
    }

    if (plan.goal === "wait") {
      return await createStuckResult("stuck_no_progress", "Halaman tidak berubah setelah 2 aksi. Lowongan dilewati.");
    }

    if (plan.goal === "final_submit" && mode === "review_each_application") {
      const review = await createReviewApplication({ campaign, jobListing, note: "Submit final memerlukan review user.", answersJson });
      applicationId = review.id;
      return { status: "pending_review", message: "Submit final memerlukan review user.", applicationId };
    }

    if (!plan.safeToExecute || plan.actions.length === 0) {
      aiRetryCount += 1;
      if (aiRetryCount > MAX_AI_RETRIES) {
        await logWatchdogEvent({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          level: "warn",
          event: "application.ai_fallback_once_failed",
          message: "AI fallback gagal menghasilkan progres. Lowongan dilewati.",
          metadata: { step, watchdog: watchdog.getStatus() },
        });
        return await createStuckResult("apply_unavailable", "AI fallback gagal menghasilkan progres. Lowongan dilewati.");
      }
      await page.waitForTimeout(300);
      continue;
    }

    await executeUiActionPlan(page, plan, snapshot);
    aiRetryCount = 0;

    const afterSignature = await capturePageSignature(page).catch(() => null);
    if (isSamePageSignature(beforeSignature, afterSignature)) {
      if (afterSignature) {
        watchdog.recordNoProgress(afterSignature);
      }
      if (watchdog.shouldTriggerNoProgressFallback()) {
        await logWatchdogEvent({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          level: "warn",
          event: "application.no_progress_limit_reached",
          message: "Halaman tidak berubah setelah 2 aksi. Lowongan dilewati.",
          metadata: { step, watchdog: watchdog.getStatus() },
        });
        return await createStuckResult("stuck_no_progress", "Halaman tidak berubah setelah 2 aksi. Lowongan dilewati.");
      }
    } else if (afterSignature) {
      watchdog.recordProgress(afterSignature);
    }
  }

  const failed = await prisma.application.create({
    data: {
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      status: "failed",
      submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
      notes: "AI-first apply runner mencapai batas langkah maksimum.",
      answersJson: JSON.stringify(answersJson),
    },
  });

  return { status: "failed", message: "AI-first apply runner mencapai batas langkah maksimum.", applicationId: failed.id };
}
