import type { Page } from "playwright";
import { prisma } from "@/lib/db/prisma";
import { detectManualIntervention } from "@/lib/browser/page-detector";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { captureVisibleDomSnapshot, type DomSnapshot } from "@/lib/browser/dom-snapshot";
import { planUiNextActions } from "@/lib/ai/ui-action-planner";
import { executeUiActionPlan } from "@/lib/browser/ui-action-executor";
import { answerApplicationQuestion } from "@/lib/ai/question-answerer";
import type { CandidateProfileResult, QuestionAnswerResult } from "@/lib/ai/schemas";

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
  status: "submitted" | "pending_review" | "paused" | "failed" | "apply_unavailable";
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
  const startedAt = Date.now();
  let previousFingerprint: string | null = null;
  let noProgressCount = 0;
  let aiRetryCount = 0;
  let applicationId: string | undefined;

  const answersJson: AnswersJson = {
    fieldsFilled: [],
    questionAnswers: [],
    pendingQuestions: [],
    aiUi: { history: [] },
  };

  for (let step = 1; step <= MAX_STEPS_PER_JOB; step += 1) {
    if (Date.now() - startedAt > MAX_JOB_DURATION_MS) {
      const failed = await prisma.application.create({
        data: {
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          status: "failed",
          submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
          notes: "AI-first apply runner mencapai batas durasi per lowongan.",
          answersJson: JSON.stringify(answersJson),
        },
      });

      return {
        status: "failed",
        message: "AI-first apply runner mencapai batas durasi per lowongan.",
        applicationId: failed.id,
      };
    }

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: step === 1 ? "ai_form.reading_page" : "ai_form.reading_page",
      message: `AI membaca form pada langkah ${step}.`,
      metadata: { step },
    });

    const intervention = await detectManualIntervention(page);
    if (intervention.detected && intervention.reason) {
      const paused = await createPausedApplication({
        campaign,
        jobListing,
        note: "Verifikasi manual terdeteksi",
        answersJson,
      });
      applicationId = paused.id;
      return {
        status: "paused",
        message: "Verifikasi manual terdeteksi",
        applicationId,
      };
    }

    const success = await verifySubmitSuccess(page);
    if (success.submitSuccessDetected) {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "ai_form.submit_verified",
        message: "Submit berhasil diverifikasi.",
        metadata: { step, currentUrl: success.currentUrl },
      });

      const submitted = await markSubmitted({
        campaign,
        jobListing,
        note: "Lamaran berhasil diverifikasi oleh AI-first apply runner.",
        answersJson,
      });

      return {
        status: "submitted",
        message: "Lamaran berhasil dikirim.",
        applicationId: submitted.id,
      };
    }

    const snapshot = await captureVisibleDomSnapshot(page);
    const snapshotFingerprint = fingerprintSnapshot(snapshot);
    const snapshotSummary = snapshot.visibleTextSummary.slice(0, 500);

    if (previousFingerprint === snapshotFingerprint) {
      noProgressCount += 1;
    } else {
      noProgressCount = 0;
    }
    previousFingerprint = snapshotFingerprint;

    if (noProgressCount >= MAX_NO_PROGRESS) {
      const paused = await createPausedApplication({
        campaign,
        jobListing,
        note: "AI tidak melihat progres pada halaman form.",
        answersJson: {
          ...answersJson,
          aiUi: {
            ...answersJson.aiUi,
            lastSnapshotSummary: snapshotSummary,
          },
        },
      });
      applicationId = paused.id;
      return {
        status: "paused",
        message: "Sistem membutuhkan keputusan Anda.",
        applicationId,
      };
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
        repeatedFingerprintCount: noProgressCount,
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

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "ai_form.action_selected",
      message: `AI memilih aksi ${plan.goal}.`,
      metadata: {
        step,
        goal: plan.goal,
        confidence: plan.confidence,
        safeToExecute: plan.safeToExecute,
        safeToSubmit: plan.safeToSubmit,
      },
    });

    if (plan.goal === "ask_user") {
      const extractedQuestion = plan.userQuestion || "Pertanyaan tambahan ditemukan";
      let suggestedAnswer = plan.suggestedAnswer;
      let confidence: number | undefined;
      let evidence: string[] | undefined;

      try {
        const maybeAnswer = await maybeAnswerQuestionFromMemoryOrAi({
          question: extractedQuestion,
          profile,
          campaign,
        });
        suggestedAnswer = suggestedAnswer ?? maybeAnswer.answer;
        confidence = maybeAnswer.confidence;
        evidence = maybeAnswer.evidence;
      } catch {
        // ignore AI suggestion failure here
      }

      answersJson.pendingQuestions.push({
        question: extractedQuestion,
        reason: plan.reason || plan.userFacingReason || "Sistem membutuhkan keputusan Anda.",
        suggestedAnswer,
        confidence,
        evidence,
        answerOptions: plan.answerOptions,
      });

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        level: "warn",
        event: "ai_form.question_needs_user",
        message: "Sistem membutuhkan keputusan Anda.",
        metadata: {
          step,
          question: extractedQuestion,
          suggestedAnswer: suggestedAnswer ?? null,
          answerOptions: plan.answerOptions ?? null,
        },
      });

      const paused = await createPausedApplication({
        campaign,
        jobListing,
        note: "Sistem membutuhkan keputusan Anda.",
        answersJson,
      });
      applicationId = paused.id;
      return {
        status: "paused",
        message: "Sistem membutuhkan keputusan Anda.",
        applicationId,
      };
    }

    if (plan.goal === "manual_intervention") {
      const paused = await createPausedApplication({
        campaign,
        jobListing,
        note: "Verifikasi manual terdeteksi",
        answersJson,
      });
      applicationId = paused.id;
      return {
        status: "paused",
        message: "Verifikasi manual terdeteksi",
        applicationId,
      };
    }

    if (plan.goal === "skip_job") {
      await prisma.jobListing.update({ where: { id: jobListing.id }, data: { status: "apply_unavailable" as never } });
      return {
        status: "apply_unavailable",
        message: plan.userFacingReason || "Lowongan dilewati oleh AI.",
      };
    }

    if (plan.goal === "wait") {
      await page.waitForTimeout(700);
      continue;
    }

    if (plan.goal === "final_submit" && mode === "review_each_application") {
      const review = await createReviewApplication({
        campaign,
        jobListing,
        note: "Submit final memerlukan review user.",
        answersJson,
      });
      applicationId = review.id;
      return {
        status: "pending_review",
        message: "Submit final memerlukan review user.",
        applicationId,
      };
    }

    if (!plan.safeToExecute || plan.actions.length === 0) {
      aiRetryCount += 1;
      if (aiRetryCount > MAX_AI_RETRIES) {
        const paused = await createPausedApplication({
          campaign,
          jobListing,
          note: plan.userFacingReason || "AI tidak yakin dengan aksi berikutnya.",
          answersJson,
        });
        applicationId = paused.id;
        return {
          status: "paused",
          message: "AI tidak yakin dengan aksi berikutnya.",
          applicationId,
        };
      }
      await page.waitForTimeout(800);
      continue;
    }

    await executeUiActionPlan(page, plan, snapshot);
    aiRetryCount = 0;

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: plan.goal === "final_submit" ? "ai_form.auto_submit_clicked" : "ai_form.action_executed",
      message: plan.goal === "final_submit" ? "AI mengklik submit otomatis yang aman." : "AI menjalankan aksi pada form.",
      metadata: {
        step,
        goal: plan.goal,
        targetElementId: plan.actions[0]?.elementId ?? null,
      },
    });

    if (plan.goal === "answer_question") {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "ai_form.yes_no_answered",
        message: "AI memilih jawaban untuk pertanyaan pada form.",
        metadata: { step },
      });
    }

    if (plan.goal === "final_submit") {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "ai_form.submit_ready",
        message: "Submit final terdeteksi aman dan sedang diverifikasi.",
        metadata: { step },
      });
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

  return {
    status: "failed",
    message: "AI-first apply runner mencapai batas langkah maksimum.",
    applicationId: failed.id,
  };
}
