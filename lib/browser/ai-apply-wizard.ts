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

const MAX_STEPS = 20;
const MAX_NO_CHANGE_STEPS = 3;

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
  }>;
  aiUi?: {
    lastGoal?: string;
    lastReason?: string;
    lastTargetElementId?: string | null;
    lastSnapshotSummary?: string;
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
      evidence: ["Jawaban serupa ditemukan di QuestionMemory."],
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

export async function runAiApplyWizard({
  page,
  jobListing,
  campaign,
  profile,
  mode,
}: {
  page: Page;
  jobListing: JobListingData;
  campaign: CampaignData;
  profile: ProfileData;
  mode: SubmitModeStrategy;
}): Promise<ApplyResult> {
  const candidateProfile = buildCandidateProfile(profile);
  const questionMemory = await getQuestionMemory();
  let previousFingerprint: string | null = null;
  let noChangeSteps = 0;
  let applicationId: string | undefined;

  const answersJson: AnswersJson = {
    fieldsFilled: [],
    questionAnswers: [],
    pendingQuestions: [],
    aiUi: {},
  };

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: step === 1 ? "ai_ui.observe_started" : "ai_ui.observe_repeat",
      message: `AI UI Agent mengamati tampilan pada langkah ${step}.`,
      metadata: { step },
    });

    const intervention = await detectManualIntervention(page);
    if (intervention.detected && intervention.reason) {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        level: "warn",
        event: "ai_ui.action_rejected",
        message: "Verifikasi manual terdeteksi. AI UI Agent dihentikan.",
        metadata: { step, reason: intervention.reason, details: intervention.details ?? null },
      });

      const paused = await createPausedApplication({
        campaign,
        jobListing,
        note: "Verifikasi manual terdeteksi",
        answersJson: {
          ...answersJson,
          aiUi: {
            ...answersJson.aiUi,
            lastReason: "Verifikasi manual terdeteksi",
          },
        },
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
        event: "ai_ui.submitted_verified",
        message: "Sistem memverifikasi bahwa lamaran sudah terkirim.",
        metadata: { step, currentUrl: success.currentUrl },
      });

      const submitted = await markSubmitted({
        campaign,
        jobListing,
        note: "Lamaran berhasil diverifikasi oleh AI UI Agent.",
        answersJson: {
          ...answersJson,
          aiUi: {
            ...answersJson.aiUi,
            lastReason: "Lamaran berhasil diverifikasi oleh AI UI Agent.",
          },
        },
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

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "ai_ui.snapshot_captured",
      message: `Snapshot tampilan berhasil diambil pada langkah ${step}.`,
      metadata: {
        step,
        currentUrl: snapshot.currentUrl,
        pageTitle: snapshot.pageTitle,
        elementCount: snapshot.elements.length,
      },
    });

    if (previousFingerprint === snapshotFingerprint) {
      noChangeSteps += 1;
    } else {
      noChangeSteps = 0;
    }
    previousFingerprint = snapshotFingerprint;

    if (noChangeSteps >= MAX_NO_CHANGE_STEPS) {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        level: "warn",
        event: "ai_ui.stuck_detected",
        message: "AI UI Agent mendeteksi tampilan tidak berubah berulang kali.",
        metadata: { step, noChangeSteps },
      });

      const paused = await createPausedApplication({
        campaign,
        jobListing,
        note: "AI tidak yakin tombol mana yang aman",
        answersJson: {
          ...answersJson,
          aiUi: {
            ...answersJson.aiUi,
            lastSnapshotSummary: snapshotSummary,
            lastReason: "AI tidak yakin tombol mana yang aman",
          },
        },
      });

      applicationId = paused.id;
      return {
        status: "paused",
        message: "AI tidak yakin tombol mana yang aman",
        applicationId,
      };
    }

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "ai_ui.plan_requested",
      message: `AI planner diminta menentukan aksi pada langkah ${step}.`,
      metadata: { step },
    });

    const plan = await planUiNextActions({
      domSnapshot: snapshot,
      candidateProfile,
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
        formAutomationMode: campaign.formAutomationMode ?? campaign.automationMode ?? "ai_fallback",
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
        repeatedFingerprintCount: noChangeSteps,
        externalRedirect: !snapshot.currentUrl.includes("jobstreet") && !snapshot.currentUrl.includes("jobsdb"),
      },
      safetyMode: "strict",
    });

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "ai_ui.plan_received",
      message: `AI planner mengembalikan goal ${plan.goal} pada langkah ${step}.`,
      metadata: {
        step,
        goal: plan.goal,
        confidence: plan.confidence,
        safeToExecute: plan.safeToExecute,
        safeToSubmit: plan.safeToSubmit,
      },
    });

    answersJson.aiUi = {
      lastGoal: plan.goal,
      lastReason: plan.userFacingReason,
      lastTargetElementId: plan.actions[0]?.elementId ?? null,
      lastSnapshotSummary: snapshotSummary,
    };

    if (plan.goal === "ask_user") {
      const firstQuestionElement = snapshot.elements.find((element) => {
        const text = `${element.text} ${element.label} ${element.nearbyText} ${element.formSectionText}`.trim();
        return text.endsWith("?") || /pengalaman|gaji|availability|notice|relokasi|visa|otorisasi/i.test(text);
      });

      let suggestedAnswer: Awaited<ReturnType<typeof maybeAnswerQuestionFromMemoryOrAi>> | null = null;
      const extractedQuestion = firstQuestionElement
        ? [firstQuestionElement.label, firstQuestionElement.text, firstQuestionElement.nearbyText]
          .filter(Boolean)
          .join(" ")
          .trim()
        : plan.userQuestion;

      if (extractedQuestion) {
        try {
          suggestedAnswer = await maybeAnswerQuestionFromMemoryOrAi({
            question: extractedQuestion,
            profile: candidateProfile,
            campaign,
          });
        } catch {
          suggestedAnswer = null;
        }
      }

      answersJson.pendingQuestions.push({
        question: extractedQuestion || plan.userQuestion || "Pertanyaan tambahan membutuhkan input Anda.",
        reason: plan.userFacingReason || "AI membutuhkan jawaban Anda",
        suggestedAnswer: suggestedAnswer?.answer,
        confidence: suggestedAnswer?.confidence,
        evidence: suggestedAnswer?.evidence,
      });

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        level: "warn",
        event: "ai_ui.ask_user_required",
        message: plan.userFacingReason || "AI membutuhkan jawaban Anda",
        metadata: {
          step,
          question: extractedQuestion || plan.userQuestion || null,
          suggestedAnswer: suggestedAnswer?.answer ?? null,
          confidence: suggestedAnswer?.confidence ?? null,
          evidence: suggestedAnswer?.evidence ?? null,
        },
      });

      const paused = await createPausedApplication({
        campaign,
        jobListing,
        note: "AI membutuhkan jawaban Anda",
        answersJson,
      });

      applicationId = paused.id;
      return {
        status: "paused",
        message: "AI membutuhkan jawaban Anda",
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
        message: plan.userFacingReason || "Lowongan dilewati oleh AI UI Agent.",
      };
    }

    if (plan.goal === "wait") {
      await page.waitForTimeout(700);
      continue;
    }

    if (plan.goal === "final_submit") {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "ai_ui.final_submit_detected",
        message: "AI mendeteksi tombol submit final pada halaman saat ini.",
        metadata: { step, confidence: plan.confidence },
      });

      if (mode === "review_each_application") {
        const review = await createReviewApplication({
          campaign,
          jobListing,
          note: "Submit final eksternal membutuhkan review",
          answersJson,
        });

        applicationId = review.id;
        return {
          status: "pending_review",
          message: "Submit final eksternal membutuhkan review",
          applicationId,
        };
      }

      await executeUiActionPlan(page, plan, snapshot);
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "ai_ui.final_submit_clicked",
        message: "AI UI Agent mengklik submit final secara aman.",
        metadata: { step },
      });
      continue;
    }

    if (!plan.safeToExecute || plan.actions.length === 0) {
      const paused = await createPausedApplication({
        campaign,
        jobListing,
        note: plan.userFacingReason || "AI tidak yakin tombol mana yang aman",
        answersJson,
      });

      applicationId = paused.id;
      return {
        status: "paused",
        message: plan.userFacingReason || "AI tidak yakin tombol mana yang aman",
        applicationId,
      };
    }

    await executeUiActionPlan(page, plan, snapshot);
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      event: "ai_ui.action_executed",
      message: plan.userFacingReason || `Aksi ${plan.goal} dijalankan oleh AI UI Agent.`,
      metadata: {
        step,
        goal: plan.goal,
        targetElementId: plan.actions[0]?.elementId ?? null,
      },
    });
  }

  const failed = await prisma.application.create({
    data: {
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      status: "failed",
      submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
      notes: "AI UI Agent mencapai batas langkah maksimum.",
      answersJson: JSON.stringify(answersJson),
    },
  });

  return {
    status: "failed",
    message: "AI UI Agent mencapai batas langkah maksimum.",
    applicationId: failed.id,
  };
}
