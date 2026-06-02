import { prisma } from "@/lib/db/prisma";
import { runJobstreetCampaign } from "@/lib/browser/jobstreet-agent";
import { scoreJobFit } from "@/lib/ai/job-scorer";
import { startJobApplication } from "@/lib/browser/jobstreet-apply-agent";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { canStartAutopilot } from "@/lib/campaign/campaign-state";
import {
  NON_REPICKABLE_APPLICATION_STATUSES,
  PICKABLE_JOB_STATUSES,
} from "@/lib/campaign/job-status";

export type AutopilotAction =
  | "safe_continue"
  | "search_continue"
  | "submitted_continue"
  | "skipped_continue"
  | "decision_required"
  | "question_required"
  | "manual_intervention_required"
  | "submit_unverified"
  | "review_required"
  | "paused"
  | "completed"
  | "stopped";

export type AutopilotRunResult = {
  status: AutopilotAction | "error";
  message: string;
  campaignId: string;
  currentStep?: string;
  currentJobId?: string | null;
  applicationId?: string;
  decisionRequired?: Record<string, unknown> | null;
};

type DecisionInput = {
  action: "apply" | "skip" | "skip_similar" | "ask_later" | "accept" | "reject" | "yes" | "no" | "edit_answer";
  reason?: string;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizePattern(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

async function setCampaignRuntimeState(
  campaignId: string,
  data: {
    status?: "ready" | "running" | "paused" | "stopped" | "completed" | "error";
    currentStep?: string | null;
    currentJobId?: string | null;
    currentQuestion?: string | null;
    decisionStatus?: string | null;
    decisionPayloadJson?: string | null;
    currentJobTitle?: string | null;
    currentJobCompany?: string | null;
  },
) {
  return prisma.campaign.update({
    where: { id: campaignId },
    data,
  });
}

async function getLatestProfile() {
  const profile = await prisma.candidateProfile.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!profile) {
    throw new Error("Profil kandidat belum tersedia. Analisis CV terlebih dahulu.");
  }
  return profile;
}

async function restartCampaignIfStopped(campaignId: string, status: string) {
  if (status !== "stopped") {
    return false;
  }

  await setCampaignRuntimeState(campaignId, {
    status: "running",
    currentStep: null,
    currentJobId: null,
    currentQuestion: null,
    decisionStatus: null,
    decisionPayloadJson: null,
    currentJobTitle: null,
    currentJobCompany: null,
  });

  await writeAutomationLog({
    campaignId,
    event: "campaign.restart",
    message: "Kampanye dijalankan ulang oleh user.",
  });

  return true;
}

async function ensureJobsExist(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Kampanye tidak ditemukan.");

  const existingJobs = await prisma.jobListing.count({ where: { campaignId } });
  if (existingJobs > 0) {
    return { searched: false, jobsFound: existingJobs };
  }

  const profile = await getLatestProfile();
  await writeAutomationLog({
    campaignId,
    event: "campaign.autopilot_search_started",
    message: "Autopilot menjalankan pencarian lowongan karena kampanye belum memiliki lowongan.",
  });

  const result = await runJobstreetCampaign({
    campaignId,
    keyword: campaign.keyword,
    location: campaign.location,
    targetApplyCount: campaign.targetApplyCount,
    matchThreshold: campaign.matchThreshold,
    profile: {
      fullName: profile.fullName ?? undefined,
      email: profile.email ?? undefined,
      phone: profile.phone ?? undefined,
      location: profile.location ?? undefined,
    },
    defaults: {
      currentSalary: campaign.defaultCurrentSalary,
      expectedSalary: campaign.defaultExpectedSalary,
      noticePeriod: campaign.defaultNoticePeriod,
      availability: campaign.defaultAvailability,
    },
  });

  if (result.status === "manual_intervention") {
    await setCampaignRuntimeState(campaignId, {
      status: "paused",
      currentStep: "manual_intervention",
      decisionStatus: "manual_intervention",
    });
    return { searched: true, jobsFound: 0, paused: true, message: result.message };
  }

  if (result.status === "search_failed") {
    await setCampaignRuntimeState(campaignId, {
      status: "error",
      currentStep: "search_failed",
    });
    throw new Error(result.message);
  }

  return { searched: true, jobsFound: result.jobsSaved ?? 0 };
}

async function scoreJobIfNeeded(campaignId: string, jobId: string) {
  const job = await prisma.jobListing.findUnique({
    where: { id: jobId },
    include: { campaign: true },
  });
  if (!job || !job.campaign) return job;
  if (job.matchScore !== null && job.matchReason) return job;

  const profile = await getLatestProfile();
  const candidateProfile = {
    fullName: profile.fullName ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    location: profile.location ?? "",
    summary: profile.summary ?? "",
    skills: parseJson<string[]>(profile.skillsJson, []),
    workExperience: parseJson<Record<string, unknown>[]>(profile.experienceJson, []),
    education: parseJson<Record<string, unknown>[]>(profile.educationJson, []),
    projects: parseJson<Record<string, unknown>[]>(profile.projectsJson, []),
    certifications: parseJson<string[]>(profile.certificationsJson, []),
    suggestedJobRoles: [],
  };

  const score = await scoreJobFit(
    candidateProfile,
    {
      keyword: job.campaign.keyword,
      location: job.campaign.location,
      expectedSalary: job.campaign.defaultExpectedSalary,
      workModePreference: job.campaign.workModePreference,
      matchThreshold: job.campaign.matchThreshold,
    },
    {
      title: job.title,
      company: job.company,
      location: job.location,
      salaryText: job.salaryText,
      workType: job.workType,
      description: job.description,
      url: job.url,
    },
  );

  return prisma.jobListing.update({
    where: { id: jobId },
    data: {
      matchScore: Math.round(score.overallScore),
      matchReason: score.reasoning,
      status: Math.round(score.overallScore) >= job.campaign.matchThreshold ? "shortlisted" : "skipped",
    },
    include: { campaign: true },
  });
}

async function pickNextJob(campaignId: string, options?: { allowSkipped?: boolean }) {
  const blockedJobIds = (
    await prisma.application.findMany({
      where: {
        campaignId,
        status: { in: [...NON_REPICKABLE_APPLICATION_STATUSES] as Array<"submitted" | "pending_review" | "paused" | "failed"> },
      },
      select: { jobListingId: true },
    })
  ).map((item) => item.jobListingId);

  const candidateStatuses = options?.allowSkipped
    ? [...PICKABLE_JOB_STATUSES]
    : PICKABLE_JOB_STATUSES.filter((status) => status !== "skipped");

  return prisma.jobListing.findFirst({
    where: {
      campaignId,
      status: { in: candidateStatuses as Array<"discovered" | "shortlisted" | "skipped"> },
      id: { notIn: blockedJobIds },
    },
    orderBy: [{ matchScore: "desc" }, { createdAt: "asc" }],
    include: { campaign: true },
  });
}

async function hasRecentApplyUnavailableLog(campaignId: string, jobId: string) {
  const existingLog = await prisma.automationLog.findFirst({
    where: {
      campaignId,
      jobListingId: jobId,
      event: "campaign.autopilot_job_apply_unavailable",
    },
    orderBy: { createdAt: "desc" },
  });

  return Boolean(existingLog);
}

async function findMatchingLowScoreRule(campaignId: string, jobTitle: string) {
  const rules = await (prisma as unknown as {
    campaignDecisionRule: {
      findMany: (args: unknown) => Promise<Array<{ patternText: string; action: string }>>;
    };
  }).campaignDecisionRule.findMany({
    where: { campaignId, type: "low_score" },
    orderBy: { createdAt: "desc" },
  });

  const normalizedTitle = normalizePattern(jobTitle);
  return rules.find((rule: { patternText: string }) => normalizedTitle.includes(normalizePattern(rule.patternText)));
}

export async function runCampaignAutopilot(campaignId: string): Promise<AutopilotRunResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return { status: "error", message: "Kampanye tidak ditemukan.", campaignId };
  }

  if (!canStartAutopilot(campaign.status) && campaign.status !== "running") {
    return {
      status: "error",
      message: `Status kampanye tidak bisa menjalankan autopilot: ${campaign.status}.`,
      campaignId,
    };
  }

  await restartCampaignIfStopped(campaignId, campaign.status);

  if (campaign.appliedCount >= campaign.targetApplyCount) {
    await setCampaignRuntimeState(campaignId, {
      status: "completed",
      currentStep: "target_reached",
      decisionStatus: null,
      decisionPayloadJson: null,
    });
    return {
      status: "completed",
      message: `Target lamaran tercapai (${campaign.appliedCount}/${campaign.targetApplyCount}).`,
      campaignId,
      currentStep: "target_reached",
    };
  }

  await setCampaignRuntimeState(campaignId, {
    status: "running",
    currentStep: "searching_jobs",
    decisionStatus: null,
    decisionPayloadJson: null,
  });

  const searchState = await ensureJobsExist(campaignId);
  if (searchState.paused) {
    return {
      status: "manual_intervention_required",
      message: searchState.message ?? "Autopilot dijeda.",
      campaignId,
      currentStep: "manual_intervention",
    };
  }

  const maxConsecutiveUnavailableJobs = 5;
  const maxConsecutiveStuckJobs = 5;
  let consecutiveUnavailableJobs = 0;
  let consecutiveStuckJobs = 0;

  while (consecutiveUnavailableJobs < maxConsecutiveUnavailableJobs) {
    const nextJob = await pickNextJob(campaignId);
    if (!nextJob || !nextJob.campaign) {
      await setCampaignRuntimeState(campaignId, {
        status: "paused",
        currentStep: "no_jobs_remaining",
        decisionStatus: null,
        decisionPayloadJson: null,
        currentJobId: null,
      });
      return {
        status: "completed",
        message: "Tidak ada lowongan lagi yang bisa diproses saat ini.",
        campaignId,
        currentStep: "no_jobs_remaining",
      };
    }

    await setCampaignRuntimeState(campaignId, {
      currentStep: "scoring_job",
      currentJobId: nextJob.id,
      currentJobTitle: nextJob.title,
      currentJobCompany: nextJob.company,
    });

    const job = await scoreJobIfNeeded(campaignId, nextJob.id);
    if (!job || !job.campaign) {
      return { status: "error", message: "Lowongan gagal diproses.", campaignId };
    }

    const score = job.matchScore ?? 0;
    const threshold = job.campaign.matchThreshold;

    if (score < threshold) {
      const rule = await findMatchingLowScoreRule(campaignId, job.title);
      if (rule?.action === "auto_skip") {
        await prisma.jobListing.update({ where: { id: job.id }, data: { status: "skipped" } });
        await writeAutomationLog({
          campaignId,
          jobListingId: job.id,
          event: "campaign.autopilot_auto_skip",
          message: `Lowongan otomatis dilewati oleh aturan kampanye: ${job.title} di ${job.company}.`,
        });
        consecutiveUnavailableJobs = 0;
        continue;
      }

      if ((job.campaign as typeof job.campaign & { lowScoreMode?: string }).lowScoreMode === "auto_skip") {
        await prisma.jobListing.update({ where: { id: job.id }, data: { status: "skipped" } });
        consecutiveUnavailableJobs = 0;
        continue;
      }

      if ((job.campaign as typeof job.campaign & { lowScoreMode?: string }).lowScoreMode === "auto_apply") {
        await writeAutomationLog({
          campaignId,
          jobListingId: job.id,
          event: "campaign.autopilot_low_score_auto_apply",
          message: `Lowongan tetap diproses walau skor ${score} di bawah threshold ${threshold} sesuai mode kampanye.`,
        });
      } else {
        const decisionPayload = {
        type: "low_score",
        campaignId,
        jobId: job.id,
        title: job.title,
        company: job.company,
        score,
        threshold,
        reason: job.matchReason ?? "AI menyarankan lowongan ini dilewati.",
      };

        await setCampaignRuntimeState(campaignId, {
          status: "paused",
          currentStep: "decision_required",
          decisionStatus: "low_score",
          decisionPayloadJson: JSON.stringify(decisionPayload),
          currentJobId: job.id,
          currentJobTitle: job.title,
          currentJobCompany: job.company,
        });

        return {
          status: "decision_required",
          message: "AI menyarankan lowongan ini kurang cocok.",
          campaignId,
          currentStep: "decision_required",
          currentJobId: job.id,
          decisionRequired: decisionPayload,
        };
      }
    }

    await prisma.jobListing.update({
      where: { id: job.id },
      data: { status: "applying" },
    });

    await setCampaignRuntimeState(campaignId, {
      currentStep: "opening_job",
      currentJobId: job.id,
    });

    await writeAutomationLog({
      campaignId,
      jobListingId: job.id,
      event: "campaign.autopilot_processing_job",
      message: `Memproses lowongan ${job.title} di ${job.company}.`,
      metadata: { jobId: job.id },
    });

    const profile = await getLatestProfile();

    const applyResult = await startJobApplication({
      jobListing: {
        id: job.id,
        campaignId: job.campaignId,
        title: job.title,
        company: job.company,
        location: job.location,
        salaryText: job.salaryText,
        workType: job.workType,
        url: job.url,
        description: job.description,
        matchScore: job.matchScore,
        matchReason: job.matchReason,
        status: job.status,
      },
      campaign: {
        id: job.campaign.id,
        name: job.campaign.name,
        submitMode: job.campaign.submitMode,
        automationMode: (job.campaign as typeof job.campaign & { automationMode?: string }).automationMode,
        formAutomationMode: (job.campaign as typeof job.campaign & { formAutomationMode?: string }).formAutomationMode,
        autoSubmitSafeOnly: (job.campaign as typeof job.campaign & { autoSubmitSafeOnly?: boolean }).autoSubmitSafeOnly,
        lowScoreMode: (job.campaign as typeof job.campaign & { lowScoreMode?: string }).lowScoreMode,
        defaultCurrentSalary: job.campaign.defaultCurrentSalary,
        defaultExpectedSalary: job.campaign.defaultExpectedSalary,
        defaultNoticePeriod: job.campaign.defaultNoticePeriod,
        defaultAvailability: job.campaign.defaultAvailability,
        workModePreference: job.campaign.workModePreference,
      },
      profile: {
        fullName: profile.fullName ?? "",
        email: profile.email ?? "",
        phone: profile.phone ?? "",
        location: profile.location ?? "",
        summary: profile.summary ?? "",
        skillsJson: profile.skillsJson ?? "[]",
        experienceJson: profile.experienceJson ?? "[]",
        educationJson: profile.educationJson ?? "[]",
        projectsJson: profile.projectsJson ?? "[]",
        certificationsJson: profile.certificationsJson ?? "[]",
      },
      submitMode:
        (job.campaign as typeof job.campaign & { autoSubmitSafeOnly?: boolean; automationMode?: string }).autoSubmitSafeOnly
        || (job.campaign as typeof job.campaign & { autoSubmitSafeOnly?: boolean; automationMode?: string }).automationMode === "auto_submit_safe_only"
          ? "auto_submit_safe_only"
          : "review_each_application",
    });

    if (applyResult.status === "submitted") {
      await writeAutomationLog({
        campaignId,
        jobListingId: job.id,
        event: "campaign.autopilot_next_job",
        message: "Submit berhasil diverifikasi. Lanjut lowongan berikutnya.",
        metadata: { applicationId: applyResult.applicationId ?? null },
      });

      consecutiveUnavailableJobs = 0;
      consecutiveStuckJobs = 0;

      const refreshedCampaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { appliedCount: true, targetApplyCount: true },
      });

      if (refreshedCampaign && refreshedCampaign.appliedCount >= refreshedCampaign.targetApplyCount) {
        await setCampaignRuntimeState(campaignId, {
          status: "completed",
          currentStep: "target_reached",
          decisionStatus: null,
          decisionPayloadJson: null,
          currentJobId: null,
          currentQuestion: null,
        });
        return {
          status: "completed",
          message: "Target lamaran tercapai.",
          campaignId,
          currentStep: "target_reached",
          currentJobId: job.id,
          applicationId: applyResult.applicationId,
        };
      }

      await setCampaignRuntimeState(campaignId, {
        status: "running",
        currentStep: "next_job",
        decisionStatus: null,
        decisionPayloadJson: null,
      });

      return {
        status: "submitted_continue",
        message: "Lamaran berhasil dikirim. Lanjut lowongan berikutnya.",
        campaignId,
        currentStep: "next_job",
        currentJobId: job.id,
        applicationId: applyResult.applicationId,
      };
    }

    if (applyResult.status === "paused") {
      const application = applyResult.applicationId
        ? await prisma.application.findUnique({ where: { id: applyResult.applicationId } })
        : null;
      const answers = parseJson<{ pendingQuestions?: Array<{ question: string }> }>(application?.answersJson, {});
      const pendingQuestion = answers.pendingQuestions?.[0]?.question ?? null;

      const pausedReason = applyResult.message;
      const inferredDecisionStatus = pendingQuestion
        ? "question_required"
        : pausedReason === "Verifikasi manual terdeteksi"
          ? "manual_intervention"
          : pausedReason === "Submit final eksternal membutuhkan review"
            ? "review_required"
            : pausedReason === "AI membutuhkan jawaban Anda"
              ? "question_required"
              : "paused";

      await setCampaignRuntimeState(campaignId, {
        status: "paused",
        currentStep: pendingQuestion
          ? "question_required"
          : inferredDecisionStatus === "manual_intervention"
            ? "manual_intervention"
            : inferredDecisionStatus === "review_required"
              ? "review_required"
              : "apply_paused",
        currentQuestion: pendingQuestion ?? pausedReason,
        decisionStatus: inferredDecisionStatus,
        decisionPayloadJson: JSON.stringify({
          type: inferredDecisionStatus,
          applicationId: application?.id ?? null,
          question: pendingQuestion,
          message: applyResult.message,
        }),
      });

      return {
        status: pendingQuestion ? "question_required" : inferredDecisionStatus === "manual_intervention"
          ? "manual_intervention_required"
          : "submit_unverified",
        message: applyResult.message,
        campaignId,
        currentStep: pendingQuestion ? "question_required" : inferredDecisionStatus === "manual_intervention" ? "manual_intervention" : "submit_unverified",
        currentJobId: job.id,
        applicationId: application?.id,
      };
    }

    if (["apply_unavailable", "stuck_no_progress", "submit_not_found_timeout"].includes(applyResult.status)) {
      const mappedStatus = applyResult.status === "apply_unavailable" ? "apply_unavailable" : "failed";
      await prisma.jobListing.update({ where: { id: job.id }, data: { status: mappedStatus } });

      await writeAutomationLog({
        campaignId,
        jobListingId: job.id,
        level: "warn",
        event: "application.job_stuck_skipped",
        message:
          applyResult.status === "submit_not_found_timeout"
            ? "Submit tidak ditemukan dalam batas waktu. Lowongan dilewati."
            : applyResult.status === "stuck_no_progress"
              ? "Halaman tidak berubah setelah 2 aksi. Lowongan dilewati."
              : "Lowongan dilewati karena tidak ada aksi aman yang berguna.",
        metadata: { resultStatus: applyResult.status, applicationId: applyResult.applicationId ?? null },
      });

      await writeAutomationLog({
        campaignId,
        jobListingId: job.id,
        event: "campaign.autopilot_continue_after_stuck",
        message: "Autopilot lanjut ke lowongan berikutnya.",
        metadata: { resultStatus: applyResult.status, consecutiveStuckJobs: consecutiveStuckJobs + 1 },
      });

      consecutiveUnavailableJobs += applyResult.status === "apply_unavailable" ? 1 : 0;
      consecutiveStuckJobs += 1;

      if (consecutiveStuckJobs >= maxConsecutiveStuckJobs) {
        await setCampaignRuntimeState(campaignId, {
          status: "paused",
          currentStep: "too_many_unusable_jobs",
          currentJobId: job.id,
          currentQuestion: "Terlalu banyak lowongan stuck berturut-turut. Periksa filter kampanye atau jalankan ulang nanti.",
          decisionStatus: "paused",
          decisionPayloadJson: null,
        });

        return {
          status: "paused",
          message: "Terlalu banyak lowongan stuck berturut-turut. Periksa filter kampanye atau jalankan ulang nanti.",
          campaignId,
          currentStep: "too_many_unusable_jobs",
          currentJobId: job.id,
        };
      }

      await setCampaignRuntimeState(campaignId, {
        status: "running",
        currentStep: "next_job",
        currentJobId: job.id,
        currentQuestion: applyResult.message,
        decisionStatus: null,
        decisionPayloadJson: null,
      });

      return {
        status: "skipped_continue",
        message: "Autopilot lanjut ke lowongan berikutnya.",
        campaignId,
        currentStep: "next_job",
        currentJobId: job.id,
      };
    }

    if (applyResult.status === "pending_review") {
      await setCampaignRuntimeState(campaignId, {
        status: "paused",
        currentStep: "submit_unverified",
        decisionStatus: "submit_unverified",
        decisionPayloadJson: JSON.stringify({
          type: "submit_unverified",
          applicationId: applyResult.applicationId ?? null,
          message: applyResult.message,
        }),
        currentQuestion: null,
      });

      return {
        status: "submit_unverified",
        message: applyResult.message,
        campaignId,
        currentStep: "submit_unverified",
        currentJobId: job.id,
        applicationId: applyResult.applicationId,
      };
    }

    await prisma.jobListing.update({ where: { id: job.id }, data: { status: "failed" } });
    return {
      status: "error",
      message: applyResult.message,
      campaignId,
      currentStep: "apply_failed",
      currentJobId: job.id,
    };
  }

  await setCampaignRuntimeState(campaignId, {
    status: "paused",
    currentStep: "too_many_unusable_jobs",
    currentQuestion: "Terlalu banyak lowongan stuck berturut-turut. Periksa filter kampanye atau jalankan ulang nanti.",
    decisionStatus: null,
    decisionPayloadJson: null,
  });

  return {
    status: "completed",
    message: "Terlalu banyak lowongan stuck berturut-turut. Periksa filter kampanye atau jalankan ulang nanti.",
    campaignId,
    currentStep: "too_many_unusable_jobs",
  };
}

export async function applyAutopilotDecision(campaignId: string, input: DecisionInput) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    throw new Error("Kampanye tidak ditemukan.");
  }

  const payload = parseJson<Record<string, unknown> | null>((campaign as typeof campaign & { decisionPayloadJson?: string | null }).decisionPayloadJson, null);
  const jobId = typeof payload?.jobId === "string" ? payload.jobId : null;

  if (!jobId) {
    throw new Error("Tidak ada keputusan aktif yang bisa diproses.");
  }

  if (input.action === "skip" || input.action === "skip_similar") {
    await prisma.jobListing.update({ where: { id: jobId }, data: { status: "skipped" } });

    if (input.action === "skip_similar") {
      const job = await prisma.jobListing.findUnique({ where: { id: jobId } });
      if (job) {
        await (prisma as unknown as {
          campaignDecisionRule: {
            create: (args: unknown) => Promise<unknown>;
          };
        }).campaignDecisionRule.create({
          data: {
            campaignId,
            type: "low_score",
            patternText: job.title,
            action: "auto_skip",
            reason: input.reason ?? "User memilih selalu melewati kasus serupa di kampanye ini.",
          },
        });
      }
    }
  }

  if (input.action === "apply") {
    await prisma.jobListing.update({ where: { id: jobId }, data: { status: "shortlisted" } });
  }

  if (input.action === "ask_later") {
    await setCampaignRuntimeState(campaignId, {
      status: "paused",
      currentStep: "decision_required",
    });
    return {
      status: "paused" as const,
      message: "Keputusan disimpan untuk nanti.",
    };
  }

  await setCampaignRuntimeState(campaignId, {
    status: "running",
    currentStep: "decision_resolved",
    decisionStatus: null,
    decisionPayloadJson: null,
    currentQuestion: null,
  });

  return {
    status: "safe_continue" as const,
    message: input.action === "apply"
      ? "Lowongan disetujui untuk tetap dilamar."
      : "Lowongan dilewati sesuai keputusan Anda.",
  };
}
