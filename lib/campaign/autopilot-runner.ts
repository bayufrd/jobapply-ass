import { prisma } from "@/lib/db/prisma";
import { runJobstreetCampaign } from "@/lib/browser/jobstreet-agent";
import { scoreJobFit } from "@/lib/ai/job-scorer";
import { startJobApplication } from "@/lib/browser/jobstreet-apply-agent";
import { runMcpAiApplyRunner } from "@/lib/browser/mcp-ai-apply-runner";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { canStartAutopilot } from "@/lib/campaign/campaign-state";
import {
  AUTO_APPLY_FALLBACK_JOB_STATUSES,
  NON_REPICKABLE_APPLICATION_STATUSES,
  PICKABLE_JOB_STATUSES,
} from "@/lib/campaign/job-status";
import { checkPlaywrightMcpHealth } from "@/lib/mcp/mcp-health";
import { resolveCampaignPaginationDecision } from "@/lib/campaign/campaign-pagination-state";
import { safeJsonParse } from "@/lib/utils/safe-json";
import { analyzeJobstreetSessionSnapshot } from "@/lib/jobstreet/session-check";
import { PlaywrightMcpClient } from "@/lib/mcp/playwright-mcp-client";
import { buildJobstreetApplyUrl, extractJobstreetJobId } from "@/lib/jobstreet/jobstreet-url";

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
  canContinue?: boolean;
  nextAction?: "continue_autopilot";
  nextStep?: string;
  searchSummary?: {
    foundCount: number;
    savedCount: number;
    scoredCount: number;
    scoringFailedCount: number;
  };
  currentJob?: {
    id: string;
    title: string;
    company: string;
    url: string;
  };
};

type DecisionInput = {
  action: "apply" | "skip" | "skip_similar" | "ask_later" | "accept" | "reject" | "yes" | "no" | "edit_answer" | "resume_after_login";
  reason?: string;
};


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
    return {
      searched: false,
      jobsFound: existingJobs,
      jobsSaved: existingJobs,
      scoredCount: await prisma.jobListing.count({ where: { campaignId, matchScore: { not: null } } }),
      scoringFailedCount: await prisma.jobListing.count({ where: { campaignId, matchScore: null, status: "discovered" } }),
    };
  }

  const profile = await getLatestProfile();
  await writeAutomationLog({
    campaignId,
    event: "campaign.phase_search_started",
    message: "Fase 1/3: mencari dan menyimpan lowongan.",
    metadata: { campaignId },
  });
  await writeAutomationLog({
    campaignId,
    event: "campaign.search_limit_info",
    message: "Autopilot akan mengambil maksimal 20 lowongan pada fase pencarian awal.",
    metadata: { campaignId, hardCap: 20 },
  });
  await writeAutomationLog({
    campaignId,
    event: "campaign.autopilot_search_started",
    message: "Autopilot menjalankan pencarian lowongan karena kampanye belum memiliki lowongan.",
    metadata: { campaignId },
  });

  const result = await runJobstreetCampaign({
    campaignId,
    keyword: campaign.keyword,
    location: campaign.location,
    targetApplyCount: campaign.targetApplyCount,
    matchThreshold: campaign.matchThreshold,
    currentSearchPage: (campaign as typeof campaign & { currentSearchPage?: number | null }).currentSearchPage ?? 1,
    currentSearchUrl: (campaign as typeof campaign & { currentSearchUrl?: string | null }).currentSearchUrl ?? null,
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
      decisionStatus: "manual_intervention_required",
      currentQuestion: result.message,
      decisionPayloadJson: JSON.stringify({
        type: "manual_intervention_required",
        message: result.message,
      }),
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

  await writeAutomationLog({
    campaignId,
    event: "campaign.phase_search_completed",
    message: `Fase 1/3 selesai: ${result.jobsSaved ?? 0} lowongan tersimpan.`,
    metadata: { campaignId, jobsSaved: result.jobsSaved ?? 0 },
  });

  return {
    searched: true,
    jobsFound: result.jobsFound ?? result.jobsSaved ?? 0,
    jobsSaved: result.jobsSaved ?? 0,
    scoredCount: await prisma.jobListing.count({ where: { campaignId, matchScore: { not: null } } }),
    scoringFailedCount: await prisma.jobListing.count({ where: { campaignId, matchScore: null, status: "discovered" } }),
  };
}

async function getCampaignJobStatusCounts(campaignId: string) {
  const [foundCount, shortlistedCount, scoringFailedCount, skippedCount, applyUnavailableCount] = await Promise.all([
    prisma.jobListing.count({ where: { campaignId } }),
    prisma.jobListing.count({ where: { campaignId, status: "shortlisted" } }),
    prisma.jobListing.count({ where: { campaignId, status: "discovered", matchScore: null } }),
    prisma.jobListing.count({ where: { campaignId, status: "skipped" } }),
    prisma.jobListing.count({ where: { campaignId, status: "apply_unavailable" } }),
  ]);

  return {
    foundCount,
    shortlistedCount,
    scoringFailedCount,
    skippedCount,
    applyUnavailableCount,
  };
}

async function scoreJobIfNeeded(campaignId: string, jobId: string) {
  const job = await prisma.jobListing.findUnique({
    where: { id: jobId },
    include: { campaign: true },
  });
  if (!job || !job.campaign) return job;
  if (job.matchScore !== null && job.matchReason) return job;
  if (job.status === "shortlisted") {
    return job;
  }

  const profile = await getLatestProfile();
  const candidateProfile = {
    fullName: profile.fullName ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    location: profile.location ?? "",
    summary: profile.summary ?? "",
    skills: safeJsonParse<string[]>(profile.skillsJson, [], "autopilot.score.skills"),
    workExperience: safeJsonParse<Record<string, unknown>[]>(profile.experienceJson, [], "autopilot.score.work_experience"),
    education: safeJsonParse<Record<string, unknown>[]>(profile.educationJson, [], "autopilot.score.education"),
    projects: safeJsonParse<Record<string, unknown>[]>(profile.projectsJson, [], "autopilot.score.projects"),
    certifications: safeJsonParse<string[]>(profile.certificationsJson, [], "autopilot.score.certifications"),
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

async function pickNextJob(
  campaignId: string,
  options?: {
    allowSkipped?: boolean;
    includeApplying?: boolean;
    allowAutoApplyFallback?: boolean;
    directJobId?: string | null;
    directJobstreetJobId?: string | null;
  },
) {
  const directCandidateStatuses = options?.allowSkipped
    ? [...PICKABLE_JOB_STATUSES]
    : PICKABLE_JOB_STATUSES.filter((status) => status !== "skipped");

  if (options?.allowAutoApplyFallback) {
    directCandidateStatuses.push(...AUTO_APPLY_FALLBACK_JOB_STATUSES);
  }

  if (options?.includeApplying) {
    directCandidateStatuses.push("applying" as (typeof directCandidateStatuses)[number]);
  }

  const uniqueCandidateStatuses = [...new Set(directCandidateStatuses)] as Array<"discovered" | "shortlisted" | "skipped" | "applying">;

  let resolvedDirectListingId: string | null = null;
  if (options?.directJobId || options?.directJobstreetJobId) {
    const resolvedDirectListing = await prisma.jobListing.findFirst({
      where: {
        campaignId,
        OR: [
          ...(options.directJobId ? [{ id: options.directJobId }] : []),
          ...(options.directJobstreetJobId ? [{ jobstreetJobId: options.directJobstreetJobId }] : []),
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true },
    });
    resolvedDirectListingId = resolvedDirectListing?.id ?? null;
  }

  const blockedApplications = await prisma.application.findMany({
    where: {
      campaignId,
      status: { in: [...NON_REPICKABLE_APPLICATION_STATUSES] as Array<"submitted" | "pending_review" | "paused" | "failed"> },
    },
    select: { jobListingId: true, status: true },
  });

  const blockedJobIds = blockedApplications
    .filter((item) => {
      if (!resolvedDirectListingId || item.jobListingId !== resolvedDirectListingId) {
        return true;
      }

      return item.status !== "failed" && item.status !== "paused" && item.status !== "pending_review";
    })
    .map((item) => item.jobListingId);

  if (options?.directJobId || options?.directJobstreetJobId) {
    const directCandidate = await prisma.jobListing.findFirst({
      where: {
        campaignId,
        status: { in: uniqueCandidateStatuses },
        id: { notIn: blockedJobIds },
        OR: [
          ...(resolvedDirectListingId ? [{ id: resolvedDirectListingId }] : []),
          ...(options.directJobId ? [{ id: options.directJobId }] : []),
          ...(options.directJobstreetJobId ? [{ jobstreetJobId: options.directJobstreetJobId }] : []),
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      include: { campaign: true },
    });

    if (directCandidate) {
      return directCandidate;
    }
  }

  return prisma.jobListing.findFirst({
    where: {
      campaignId,
      status: { in: uniqueCandidateStatuses },
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

  const runtimeCampaign = campaign as typeof campaign & {
    currentSearchPage?: number | null;
    currentSearchUrl?: string | null;
    emptyPageCount?: number | null;
    processedJobCount?: number | null;
    unusableJobCount?: number | null;
    lastAppliedJobstreetJobId?: string | null;
  };

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

  if ((campaign as typeof campaign & { formAutomationMode?: string | null }).formAutomationMode === "mcp_ai_first") {
    await writeAutomationLog({
      campaignId,
      event: "mcp.preflight_started",
      message: "Memeriksa koneksi Playwright MCP sebelum menjalankan kampanye.",
      metadata: { campaignId },
    });

    const health = await checkPlaywrightMcpHealth();
    if (!health.ok) {
      const isBrowserUnavailable = health.browserDependencyOk === false || health.snapshotUsable === false;
      const currentStep = isBrowserUnavailable ? "mcp_browser_unavailable" : "mcp_unavailable";
      const decisionType = isBrowserUnavailable ? "mcp_browser_unavailable" : "mcp_unavailable";
      const userMessage = isBrowserUnavailable
        ? "Playwright MCP aktif, tetapi browser Chromium/Chrome belum siap. Jalankan npx playwright install chromium lalu restart MCP."
        : "Playwright MCP belum aktif. Jalankan npm run mcp:playwright lalu klik Lanjutkan Kampanye.";

      await setCampaignRuntimeState(campaignId, {
        status: "paused",
        currentStep,
        decisionStatus: decisionType,
        decisionPayloadJson: JSON.stringify({
          type: decisionType,
          message: userMessage,
          technicalDetails: health.error ?? null,
          mcpUrl: health.url,
          connectOk: health.connectOk,
          toolsListOk: health.toolsListOk,
          navigateOk: health.navigateOk,
          snapshotOk: health.snapshotOk,
          snapshotUsable: health.snapshotUsable,
          browserDependencyOk: health.browserDependencyOk,
          rawSnapshotPreview: health.rawSnapshotPreview ?? null,
        }),
      });
      await writeAutomationLog({
        campaignId,
        level: "warn",
        event: "mcp.preflight_failed",
        message: userMessage,
        metadata: {
          campaignId,
          stage: "mcp_connect",
          mcpUrl: health.url,
          error: health.error ?? null,
          connectOk: health.connectOk,
          toolsListOk: health.toolsListOk,
          navigateOk: health.navigateOk,
          snapshotOk: health.snapshotOk,
          snapshotUsable: health.snapshotUsable,
          browserDependencyOk: health.browserDependencyOk,
          rawSnapshotPreview: health.rawSnapshotPreview ?? null,
        },
      });
      return {
        status: "paused",
        message: userMessage,
        campaignId,
        currentStep,
        decisionRequired: {
          type: decisionType,
          message: userMessage,
          technicalDetails: health.error ?? null,
          mcpUrl: health.url,
        },
      };
    }

    await writeAutomationLog({
      campaignId,
      event: "mcp.preflight_ok",
      message: "Playwright MCP aktif dan snapshot browser siap dipakai.",
      metadata: {
        campaignId,
        stage: "mcp_connect",
        mcpUrl: health.url,
        connectOk: health.connectOk,
        toolsListOk: health.toolsListOk,
        navigateOk: health.navigateOk,
        snapshotOk: health.snapshotOk,
        snapshotUsable: health.snapshotUsable,
        browserDependencyOk: health.browserDependencyOk,
        rawSnapshotPreview: health.rawSnapshotPreview ?? null,
      },
    });
  }

  const initialDecisionPayload = safeJsonParse<Record<string, unknown> | null>(
    (campaign as typeof campaign & { decisionPayloadJson?: string | null }).decisionPayloadJson,
    null,
    "autopilot.initial_decision_payload",
  );
  const preserveDirectApplyPayload = initialDecisionPayload?.forceDirectApply === true;

  await setCampaignRuntimeState(campaignId, {
    status: "running",
    currentStep: "searching_jobs",
    decisionStatus: null,
    decisionPayloadJson: preserveDirectApplyPayload
      ? JSON.stringify(initialDecisionPayload)
      : null,
  });

  const searchState = await ensureJobsExist(campaignId);
  if (searchState.paused) {
    return {
      status: "manual_intervention_required",
      message: searchState.message ?? "Autopilot dijeda.",
      campaignId,
      currentStep: "manual_intervention",
      decisionRequired: {
        type: "manual_intervention_required",
        message: searchState.message ?? "Autopilot dijeda.",
      },
    };
  }

  const maxConsecutiveUnavailableJobs = 5;
  const maxConsecutiveStuckJobs = 5;
  let consecutiveUnavailableJobs = 0;
  let consecutiveStuckJobs = 0;

  if (searchState.searched) {
    await setCampaignRuntimeState(campaignId, {
      status: "running",
      currentStep: "search_completed",
      decisionStatus: null,
      decisionPayloadJson: null,
    });

    return {
      status: "search_continue",
      message: "Fase pencarian selesai. Melanjutkan ke fase apply...",
      campaignId,
      currentStep: "search_completed",
      canContinue: true,
      nextAction: "continue_autopilot",
      nextStep: "apply",
      searchSummary: {
        foundCount: searchState.jobsFound ?? searchState.jobsSaved ?? 0,
        savedCount: searchState.jobsSaved ?? searchState.jobsFound ?? 0,
        scoredCount: searchState.scoredCount ?? 0,
        scoringFailedCount: searchState.scoringFailedCount ?? 0,
      },
    };
  }

  while (consecutiveUnavailableJobs < maxConsecutiveUnavailableJobs) {
    const campaignSnapshot = await prisma.campaign.findUnique({ where: { id: campaignId } });
    const lowScoreMode = (campaignSnapshot as typeof campaignSnapshot & { lowScoreMode?: string | null })?.lowScoreMode ?? null;
    const forceApplyLowScore = lowScoreMode === "auto_apply";
    const directApplyPayload = safeJsonParse<Record<string, unknown> | null>(
      (campaignSnapshot as typeof campaignSnapshot & { decisionPayloadJson?: string | null })?.decisionPayloadJson,
      null,
      "autopilot.direct_apply_payload",
    );
    const forcedDirectApply = directApplyPayload?.forceDirectApply === true;
    const directJobId = typeof directApplyPayload?.directJobId === "string" ? directApplyPayload.directJobId : null;
    const eligibleStatusList = Array.from(new Set([
      ...(forceApplyLowScore ? AUTO_APPLY_FALLBACK_JOB_STATUSES : []),
      ...PICKABLE_JOB_STATUSES.filter((status) => status !== "skipped"),
      "applying",
    ]));
    const jobStatusCounts = await getCampaignJobStatusCounts(campaignId);

    await writeAutomationLog({
      campaignId,
      event: "campaign.apply_candidate_query_started",
      message: "Memeriksa lowongan eligible untuk fase apply.",
      metadata: {
        campaignId,
        eligibleStatusList,
        lowScoreMode,
        forceApplyLowScore,
        forcedDirectApply,
        directJobId,
        ...jobStatusCounts,
      },
    });

    const nextJob = await pickNextJob(campaignId, {
      includeApplying: true,
      allowAutoApplyFallback: forceApplyLowScore || jobStatusCounts.shortlistedCount === 0,
      directJobstreetJobId: forcedDirectApply ? directJobId : null,
    });

    await writeAutomationLog({
      campaignId,
      event: "campaign.apply_candidate_query_result",
      message: nextJob
        ? `Ditemukan lowongan eligible untuk diproses: ${nextJob.title}.`
        : "Tidak ada lowongan eligible untuk fase apply.",
      metadata: {
        campaignId,
        eligibleStatusList,
        eligibleCount: nextJob ? 1 : 0,
        lowScoreMode,
        forceApplyLowScore,
        forcedDirectApply,
        directJobId,
        selectedJobstreetJobId: nextJob?.jobstreetJobId ?? null,
        ...jobStatusCounts,
      },
    });
    if (!nextJob || !nextJob.campaign) {
      if (forcedDirectApply) {
        await writeAutomationLog({
          campaignId,
          level: "warn",
          event: "campaign.direct_apply_candidate_missing",
          message: "Forced direct apply aktif tetapi lowongan target tidak ditemukan dalam kandidat eligible.",
          metadata: {
            campaignId,
            directJobId,
            eligibleStatusList,
            lowScoreMode,
            forceApplyLowScore,
            ...jobStatusCounts,
          },
        });

        await setCampaignRuntimeState(campaignId, {
          status: "error",
          currentStep: "direct_apply_candidate_missing",
          currentQuestion: "Forced direct apply aktif tetapi lowongan target tidak eligible.",
          decisionStatus: "direct_apply_candidate_missing",
          decisionPayloadJson: JSON.stringify({
            type: "direct_apply_candidate_missing",
            forceDirectApply: true,
            directJobId,
            eligibleStatusList,
          }),
        });

        return {
          status: "error",
          message: "Forced direct apply gagal karena lowongan target tidak ditemukan sebagai kandidat eligible.",
          campaignId,
          currentStep: "direct_apply_candidate_missing",
          decisionRequired: {
            type: "direct_apply_candidate_missing",
            directJobId,
          },
        };
      }
      await writeAutomationLog({
        campaignId,
        level: "warn",
        event: "campaign.no_eligible_jobs_for_apply",
        message: "Tidak ada lowongan eligible untuk dilamar. Cek status scoring dan mode lowScoreMode.",
        metadata: {
          campaignId,
          eligibleStatusList,
          eligibleCount: 0,
          lowScoreMode,
          forceApplyLowScore,
          ...jobStatusCounts,
        },
      });
      const paginationDecision = resolveCampaignPaginationDecision(
        {
          currentSearchPage: runtimeCampaign.currentSearchPage ?? 1,
          emptyPageCount: runtimeCampaign.emptyPageCount ?? 0,
          verifiedSubmittedCount: campaign.appliedCount,
          targetApplyCount: campaign.targetApplyCount,
        },
        {
          pageHadProcessableJobs: (runtimeCampaign.processedJobCount ?? 0) > 0,
          shouldAdvancePage: true,
        },
      );

      if (paginationDecision.type === "advance_to_next_page") {
        const nextSearchUrl = `${runtimeCampaign.currentSearchUrl ?? ""}` || null;
        await (prisma as typeof prisma & {
          campaign: {
            update: (args: unknown) => Promise<unknown>;
          };
        }).campaign.update({
          where: { id: campaignId },
          data: {
            currentSearchPage: paginationDecision.nextSearchPage,
            currentSearchUrl: nextSearchUrl,
            emptyPageCount: paginationDecision.emptyPageCount,
            processedJobCount: 0,
            currentStep: "searching_jobs",
            currentJobId: null,
            currentQuestion: null,
            currentJobTitle: null,
            currentJobCompany: null,
            decisionStatus: null,
            decisionPayloadJson: null,
          },
        });
        await writeAutomationLog({
          campaignId,
          event: "campaign.page_exhausted_continue_next_page",
          message: `Lowongan pada page ${paginationDecision.currentSearchPage} habis. Lanjut ke page ${paginationDecision.nextSearchPage}.`,
          metadata: {
            campaignId,
            currentSearchPage: paginationDecision.currentSearchPage,
            nextSearchPage: paginationDecision.nextSearchPage,
            emptyPageCount: paginationDecision.emptyPageCount,
          },
        });
        await writeAutomationLog({
          campaignId,
          event: "campaign.next_search_page",
          message: `Menyiapkan pencarian Jobstreet page ${paginationDecision.nextSearchPage}.`,
          metadata: {
            campaignId,
            currentSearchPage: paginationDecision.nextSearchPage,
            previousSearchPage: paginationDecision.currentSearchPage,
          },
        });
        return {
          status: "search_continue",
          message: `Page ${paginationDecision.currentSearchPage} selesai. Lanjut ke page ${paginationDecision.nextSearchPage}.`,
          campaignId,
          currentStep: "searching_jobs",
          canContinue: true,
          nextAction: "continue_autopilot",
          nextStep: "searching_jobs",
        };
      }

      const terminalStep = paginationDecision.type === "too_many_empty_pages"
        ? "too_many_empty_pages"
        : paginationDecision.type === "target_reached"
          ? "target_reached"
          : "no_jobs_remaining_after_all_pages";
      const terminalMessage = terminalStep === "too_many_empty_pages"
        ? "Terlalu banyak halaman pencarian kosong berturut-turut. Kampanye dihentikan."
        : terminalStep === "target_reached"
          ? "Target lamaran tercapai."
          : "Tidak ada lowongan eligible lagi setelah semua halaman pencarian diperiksa.";

      await (prisma as typeof prisma & {
        campaign: {
          update: (args: unknown) => Promise<unknown>;
        };
      }).campaign.update({
        where: { id: campaignId },
        data: {
          status: "completed",
          currentStep: terminalStep,
          currentJobId: null,
          currentQuestion: null,
          currentJobTitle: null,
          currentJobCompany: null,
          decisionStatus: null,
          decisionPayloadJson: null,
          emptyPageCount: paginationDecision.emptyPageCount,
        },
      });
      await writeAutomationLog({
        campaignId,
        event: terminalStep === "too_many_empty_pages"
          ? "campaign.too_many_empty_pages"
          : "campaign.no_jobs_remaining_after_all_pages",
        message: terminalMessage,
        metadata: {
          campaignId,
          currentStep: terminalStep,
          currentSearchPage: paginationDecision.currentSearchPage,
          emptyPageCount: paginationDecision.emptyPageCount,
        },
      });
      return {
        status: "completed",
        message: terminalMessage,
        campaignId,
        currentStep: terminalStep,
      };
    }

    await setCampaignRuntimeState(campaignId, {
      currentStep: "scoring_job",
      currentJobId: nextJob.id,
      currentJobTitle: nextJob.title,
      currentJobCompany: nextJob.company,
    });

    let job = nextJob;
    let scoringFailed = false;
    try {
      const scoredJob = await scoreJobIfNeeded(campaignId, nextJob.id);
      if (scoredJob) {
        job = scoredJob;
      }
    } catch (error) {
      scoringFailed = true;
      await writeAutomationLog({
        campaignId,
        jobListingId: nextJob.id,
        level: "error",
        event: "campaign.job_scoring_failed",
        message: `AI scoring gagal untuk lowongan "${nextJob.title}". Autopilot tetap lanjut memakai data lowongan yang sudah ada.`,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          jobUrl: nextJob.url,
          jobStatus: nextJob.status,
          existingMatchScore: nextJob.matchScore,
        },
      });
    }
    if (!job || !job.campaign) {
      return { status: "error", message: "Lowongan gagal diproses.", campaignId };
    }

    const score = job.matchScore ?? 0;
    const threshold = job.campaign.matchThreshold;
    const shouldBypassLowScoreGate = job.matchScore === null && (job.status === "shortlisted" || scoringFailed);

    if (!shouldBypassLowScoreGate && score < threshold) {
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

    const formAutomationMode = (job.campaign as typeof job.campaign & { formAutomationMode?: string | null }).formAutomationMode ?? null;
    const automationMode = (job.campaign as typeof job.campaign & { automationMode?: string | null }).automationMode ?? null;
    const lowScoreModeValue = (job.campaign as typeof job.campaign & { lowScoreMode?: string | null }).lowScoreMode ?? null;
    const applyUrl = (job as typeof job & { applyUrl?: string | null }).applyUrl ?? null;
    const logMetadata = {
      campaignId,
      jobListingId: job.id,
      jobTitle: job.title,
      company: job.company,
      jobUrl: job.url,
      applyUrl,
      jobStatus: job.status,
      formAutomationMode,
      automationMode,
      lowScoreMode: lowScoreModeValue,
    };

    await writeAutomationLog({
      campaignId,
      jobListingId: job.id,
      event: "campaign.phase_apply_started",
      message: "Fase 2/3 dimulai: memulai apply untuk lowongan eligible.",
      metadata: logMetadata,
    });
    await writeAutomationLog({
      campaignId,
      jobListingId: job.id,
      event: "campaign.phase_apply_job_selected",
      message: `Lowongan eligible dipilih untuk apply: ${job.title}.`,
      metadata: logMetadata,
    });
    await writeAutomationLog({
      campaignId,
      jobListingId: job.id,
      event: "campaign.phase_apply_job_started",
      message: `Memulai apply untuk lowongan ${job.title}.`,
      metadata: logMetadata,
    });
    await writeAutomationLog({
      campaignId,
      jobListingId: job.id,
      event: "application.started",
      message: `Proses apply dimulai untuk lowongan ${job.title}.`,
      metadata: logMetadata,
    });
    await writeAutomationLog({
      campaignId,
      jobListingId: job.id,
      event: "campaign.autopilot_processing_job",
      message: `Memproses lowongan ${job.title} di ${job.company}.`,
      metadata: { jobId: job.id, title: job.title, company: job.company, jobUrl: job.url, applyUrl },
    });

    const profile = await getLatestProfile();
    const missingCandidateProfile = !profile;
    const missingJobUrl = typeof job.url !== "string" || job.url.trim().length === 0;
    const missingApplyUrl = typeof applyUrl !== "string" || applyUrl.trim().length === 0;
    const knownFormAutomationMode = formAutomationMode === null || ["mcp_ai_first", "ai_first", "legacy_browser"].includes(formAutomationMode);
    const knownAutomationMode = automationMode === null || ["auto_submit_safe_only", "review_each_application"].includes(automationMode);

    if (missingCandidateProfile || missingJobUrl || !knownFormAutomationMode || !knownAutomationMode) {
      await writeAutomationLog({
        campaignId,
        jobListingId: job.id,
        level: "warn",
        event: "campaign.apply_precondition_failed",
        message: "Fase apply belum bisa dimulai karena data lowongan/profil belum lengkap.",
        metadata: {
          ...logMetadata,
          missingCandidateProfile,
          missingJobUrl,
          missingApplyUrl,
        },
      });
      await setCampaignRuntimeState(campaignId, {
        status: "paused",
        currentStep: "apply_precondition_failed",
        currentQuestion: "Fase apply belum bisa dimulai karena data lowongan/profil belum lengkap.",
        decisionStatus: "missing_apply_precondition",
        decisionPayloadJson: JSON.stringify({
          type: "missing_apply_precondition",
          blockerType: "missing_apply_precondition",
          blockerEvidence: {
            missingCandidateProfile,
            missingJobUrl,
            missingApplyUrl,
            formAutomationMode,
          },
        }),
      });
      return {
        status: "paused",
        message: "Fase apply belum bisa dimulai karena data lowongan/profil belum lengkap.",
        campaignId,
        currentStep: "apply_precondition_failed",
        currentJobId: job.id,
        canContinue: false,
        decisionRequired: {
          blockerType: "missing_apply_precondition",
          evidence: {
            missingCandidateProfile,
            missingJobUrl,
            missingApplyUrl,
            formAutomationMode,
          },
        },
      };
    }

    const submitMode =
      (job.campaign as typeof job.campaign & { autoSubmitSafeOnly?: boolean; automationMode?: string }).autoSubmitSafeOnly
      || (job.campaign as typeof job.campaign & { autoSubmitSafeOnly?: boolean; automationMode?: string }).automationMode === "auto_submit_safe_only"
        ? "auto_submit_safe_only"
        : "review_each_application";

    await writeAutomationLog({
      campaignId,
      jobListingId: job.id,
      event: "campaign.apply_runner_dispatch",
      message: formAutomationMode === "mcp_ai_first"
        ? "Mendispatch apply runner MCP AI First."
        : "Mendispatch apply runner browser legacy.",
      metadata: {
        mode: formAutomationMode ?? "legacy_browser",
        runner: formAutomationMode === "mcp_ai_first" ? "runMcpAiApplyRunner" : "startJobApplication",
        jobListingId: job.id,
        jobTitle: job.title,
        jobUrl: job.url,
        applyUrl,
      },
    });

    const applyResult = formAutomationMode === "mcp_ai_first"
      ? await runMcpAiApplyRunner({
          campaign: {
            id: job.campaign.id,
            name: job.campaign.name,
            submitMode: job.campaign.submitMode,
            formAutomationMode,
            defaultCurrentSalary: job.campaign.defaultCurrentSalary,
            defaultExpectedSalary: job.campaign.defaultExpectedSalary,
            defaultNoticePeriod: job.campaign.defaultNoticePeriod,
            defaultAvailability: job.campaign.defaultAvailability,
            workModePreference: job.campaign.workModePreference,
          },
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
          candidateProfile: {
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
          questionMemory: [],
          mode: submitMode,
        })
      : await startJobApplication({
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
            formAutomationMode,
            autoSubmitSafeOnly: (job.campaign as typeof job.campaign & { autoSubmitSafeOnly?: boolean }).autoSubmitSafeOnly,
            lowScoreMode: lowScoreModeValue,
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
          submitMode,
        });

    if (applyResult.status === "submitted") {
      await writeAutomationLog({
        campaignId,
        jobListingId: job.id,
        applicationId: applyResult.applicationId,
        event: "campaign.phase_apply_job_finished",
        message: `Apply selesai untuk lowongan ${job.title}: submitted.`,
        metadata: { campaignId, jobListingId: job.id, applicationId: applyResult.applicationId ?? null, title: job.title, company: job.company, jobUrl: job.url, status: "submitted" },
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
        status: "completed",
        currentStep: "single_target_reached",
        decisionStatus: null,
        decisionPayloadJson: null,
        currentJobId: null,
        currentQuestion: null,
      });
      await writeAutomationLog({
        campaignId,
        jobListingId: job.id,
        applicationId: applyResult.applicationId,
        event: "campaign.single_target_reached",
        message: "Lamaran pertama berhasil diverifikasi. Autopilot dihentikan sesuai target 1 lowongan.",
        metadata: { applicationId: applyResult.applicationId ?? null, targetApplyCount: refreshedCampaign?.targetApplyCount ?? null },
      });

      return {
        status: "completed",
        message: "Lamaran pertama berhasil dikirim. Autopilot dihentikan sesuai target 1 lowongan.",
        campaignId,
        currentStep: "single_target_reached",
        currentJobId: job.id,
        applicationId: applyResult.applicationId,
      };
    }

    if (applyResult.status === "paused") {
      const application = applyResult.applicationId
        ? await prisma.application.findUnique({ where: { id: applyResult.applicationId } })
        : null;
      const answers = safeJsonParse<{ pendingQuestions?: Array<{ question: string }> }>(
        application?.answersJson,
        {},
        "autopilot.application_answers",
      );
      const pendingQuestion = answers.pendingQuestions?.[0]?.question ?? null;

      const pausedReason = applyResult.message;
      const inferredDecisionStatus = pendingQuestion
        ? "question_required"
        : pausedReason === "Verifikasi manual terdeteksi"
          || pausedReason.includes("intervensi manual")
          || pausedReason.includes("halaman eksternal")
            ? "manual_intervention_required"
            : pausedReason === "Submit final eksternal membutuhkan review"
              ? "review_required"
              : pausedReason === "AI membutuhkan jawaban Anda"
                || pausedReason.includes("butuh jawaban user")
                || pausedReason.includes("CV belum terpilih")
                  ? "question_required"
                  : pausedReason.includes("submit") && pausedReason.includes("verifikasi")
                    ? "submit_unverified"
                    : pausedReason.includes("langkah yang diharapkan") || pausedReason.includes("bukti verifikasi keamanan")
                      ? "state_mismatch"
                      : "paused";

      const resolvedCurrentStep = pendingQuestion
        ? "employer_questions"
        : pausedReason.includes("CV belum terpilih")
          ? "choose_documents"
          : pausedReason.includes("pertanyaan employer")
            ? "employer_questions"
            : pausedReason.includes("update profile") || pausedReason.includes("profil Jobstreet")
              ? "update_profile"
              : pausedReason.includes("review") || pausedReason.includes("submit application")
                ? "review_submit"
                : inferredDecisionStatus === "manual_intervention_required"
                  ? "manual_intervention"
                  : inferredDecisionStatus === "review_required"
                    ? "review_required"
                    : inferredDecisionStatus === "submit_unverified"
                      ? "submit_unverified"
                      : "apply_paused";

      const blockerEvidence = applyResult.error
        ? safeJsonParse<Record<string, unknown> | null>(applyResult.error, null, "autopilot.apply_paused_blocker")
        : null;

      await setCampaignRuntimeState(campaignId, {
        status: "paused",
        currentStep: resolvedCurrentStep,
        currentQuestion: pendingQuestion ?? pausedReason,
        decisionStatus: inferredDecisionStatus,
        decisionPayloadJson: JSON.stringify({
          type: inferredDecisionStatus,
          applicationId: application?.id ?? null,
          question: pendingQuestion,
          message: applyResult.message,
          step: resolvedCurrentStep,
          blockerEvidence,
        }),
      });

      return {
        status: pendingQuestion || inferredDecisionStatus === "question_required"
          ? "question_required"
          : inferredDecisionStatus === "manual_intervention_required"
            ? "manual_intervention_required"
            : inferredDecisionStatus === "state_mismatch"
              ? "paused"
              : "submit_unverified",
        message: applyResult.message,
        campaignId,
        currentStep: resolvedCurrentStep,
        currentJobId: job.id,
        applicationId: application?.id,
        decisionRequired: {
          type: inferredDecisionStatus,
          applicationId: application?.id ?? null,
          message: applyResult.message,
          blockerEvidence,
        },
      };
    }

    if (["apply_unavailable", "stuck_no_progress", "submit_not_found_timeout"].includes(applyResult.status)) {
      const blockerEvidence = applyResult.error
        ? safeJsonParse<Record<string, unknown> | null>(applyResult.error, null, "autopilot.apply_unavailable_blocker")
        : null;
      const mappedStatus = applyResult.status === "apply_unavailable" ? "apply_unavailable" : "failed";
      const blockerType = applyResult.status === "apply_unavailable"
        ? (typeof blockerEvidence?.reason === "string" ? blockerEvidence.reason : "apply_unavailable")
        : applyResult.status;
      const recoverableApplyUnavailable = applyResult.status === "apply_unavailable"
        && blockerEvidence?.canContinue !== false;
      await prisma.jobListing.update({ where: { id: job.id }, data: { status: mappedStatus } });

      if (recoverableApplyUnavailable) {
        await writeAutomationLog({
          campaignId,
          jobListingId: job.id,
          level: "warn",
          event: "campaign.autopilot_job_apply_unavailable",
          message: applyResult.message,
          metadata: {
            resultStatus: applyResult.status,
            applicationId: applyResult.applicationId ?? null,
            blockerType,
            blockerEvidence,
          },
        });

        await setCampaignRuntimeState(campaignId, {
          status: "running",
          currentStep: "next_job",
          currentJobId: job.id,
          currentQuestion: applyResult.message,
          decisionStatus: null,
          decisionPayloadJson: JSON.stringify({
            type: blockerType,
            message: applyResult.message,
            canContinue: true,
            currentStep: blockerType === "invalid_url" ? "external_redirect_invalid_url" : blockerType,
            latestJob: {
              id: job.id,
              title: job.title,
              company: job.company,
            },
            latestApplication: applyResult.applicationId ? { id: applyResult.applicationId, status: applyResult.status } : null,
            blockerEvidence,
          }),
          currentJobTitle: job.title,
          currentJobCompany: job.company,
        });

        return {
          status: "skipped_continue",
          message: "Autopilot lanjut ke lowongan berikutnya.",
          campaignId,
          currentStep: "next_job",
          currentJobId: job.id,
          applicationId: applyResult.applicationId,
        };
      }
 
      await writeAutomationLog({
        campaignId,
        jobListingId: job.id,
        level: "error",
        event: "campaign.autopilot_aborted_after_error",
        message:
          applyResult.status === "submit_not_found_timeout"
            ? "Submit tidak ditemukan dalam batas waktu. Autopilot dihentikan agar tidak lanjut ke lowongan lain."
            : applyResult.status === "stuck_no_progress"
              ? "Halaman tidak berubah setelah 2 aksi. Autopilot dihentikan agar tidak lanjut ke lowongan lain."
              : blockerType === "external_redirect"
                ? "Lowongan mengarah ke website eksternal. Autopilot dihentikan agar tidak lanjut ke lowongan lain."
                : "URL lamaran tidak valid atau mengarah ke luar Jobstreet. Autopilot dihentikan agar tidak lanjut ke lowongan lain.",
        metadata: {
          resultStatus: applyResult.status,
          applicationId: applyResult.applicationId ?? null,
          blockerType,
          blockerEvidence,
        },
      });
 
      await setCampaignRuntimeState(campaignId, {
        status: "error",
        currentStep: blockerType === "invalid_url" ? "external_redirect_invalid_url" : blockerType,
        currentJobId: job.id,
        currentQuestion: applyResult.message,
        decisionStatus: blockerType,
        decisionPayloadJson: JSON.stringify({
          type: blockerType,
          message: applyResult.message,
          canContinue: false,
          latestJob: {
            id: job.id,
            title: job.title,
            company: job.company,
          },
          latestApplication: applyResult.applicationId ? { id: applyResult.applicationId, status: applyResult.status } : null,
          blockerEvidence,
        }),
        currentJobTitle: job.title,
        currentJobCompany: job.company,
      });
 
      return {
        status: "error",
        message: "Autopilot dihentikan karena error pada lowongan saat ini.",
        campaignId,
        currentStep: blockerType === "invalid_url" ? "external_redirect_invalid_url" : blockerType,
        currentJobId: job.id,
        applicationId: applyResult.applicationId,
        decisionRequired: {
          type: blockerType,
          applicationId: applyResult.applicationId ?? null,
          message: applyResult.message,
          blockerEvidence,
        },
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
    await setCampaignRuntimeState(campaignId, {
      status: "paused",
      currentStep: "apply_failed",
      currentJobId: job.id,
      currentQuestion: applyResult.message,
      decisionStatus: "stuck_no_progress",
      decisionPayloadJson: JSON.stringify({
        type: "stuck_no_progress",
        applicationId: applyResult.applicationId ?? null,
        message: applyResult.message,
      }),
    });
    return {
      status: "paused",
      message: applyResult.message,
      campaignId,
      currentStep: "apply_failed",
      currentJobId: job.id,
      applicationId: applyResult.applicationId,
      decisionRequired: {
        type: "stuck_no_progress",
        applicationId: applyResult.applicationId ?? null,
        message: applyResult.message,
      },
    };
  }

  await setCampaignRuntimeState(campaignId, {
    status: "completed",
    currentStep: "too_many_unusable_jobs",
    currentQuestion: "Terlalu banyak lowongan stuck berturut-turut. Periksa filter kampanye atau jalankan ulang nanti.",
    decisionStatus: null,
    decisionPayloadJson: null,
    currentJobId: null,
    currentJobTitle: null,
    currentJobCompany: null,
  });
  await writeAutomationLog({
    campaignId,
    event: "campaign.too_many_unusable_jobs",
    message: "Terlalu banyak lowongan stuck berturut-turut. Kampanye dihentikan.",
    metadata: { campaignId, currentStep: "too_many_unusable_jobs", consecutiveUnavailableJobs },
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

  const payload = safeJsonParse<Record<string, unknown> | null>(
    (campaign as typeof campaign & { decisionPayloadJson?: string | null }).decisionPayloadJson,
    null,
    "autopilot.handle_decision_payload",
  );
  const jobId = typeof payload?.jobId === "string" ? payload.jobId : null;
  const applicationId = typeof payload?.applicationId === "string" ? payload.applicationId : null;
  const decisionType = typeof payload?.type === "string" ? payload.type : null;

  if (input.action === "resume_after_login") {
    await writeAutomationLog({
      campaignId,
      event: "campaign.resume_after_otp_started",
      message: "User meminta resume setelah login manual Jobstreet.",
      metadata: {
        decisionType,
        jobId,
        applicationId,
      },
    });

    const activeJob = jobId
      ? await prisma.jobListing.findUnique({ where: { id: jobId } })
      : null;

    const resolvedJobUrl = activeJob?.url ?? null;
    const jobstreetJobId = resolvedJobUrl ? extractJobstreetJobId(resolvedJobUrl) : null;
    const applyTargetUrl = jobstreetJobId ? buildJobstreetApplyUrl(jobstreetJobId, "apply") : null;

    if (!applyTargetUrl) {
      throw new Error("Tidak bisa melanjutkan login karena lowongan aktif Jobstreet tidak ditemukan.");
    }

    await writeAutomationLog({
      campaignId,
      event: "jobstreet.session_check_started",
      message: "Validasi sesi Jobstreet live via MCP dimulai untuk resume setelah login.",
      metadata: {
        targetUrl: resolvedJobUrl,
        applyTargetUrl,
      },
    }).catch(() => undefined);

    try {
      const client = new PlaywrightMcpClient();
      await client.connect();
      await client.navigate(applyTargetUrl);
      let snapshot = await client.snapshot();
      let result = analyzeJobstreetSessionSnapshot(snapshot);
      let lastActionableResult = result.state === "unknown" ? null : result;
      let recoveryAttempted = false;
      let emailFillAttempted = false;
      let emailFillCompleted = false;
      let settleAttempts = 0;

      const findVisibleEmailElement = () => snapshot.elements.find((element) => {
        if (element.disabled) return false;
        const role = String(element.role ?? "").toLowerCase();
        const name = String(element.name ?? "").toLowerCase();
        const text = String(element.text ?? "").toLowerCase();
        const value = String(element.value ?? "").toLowerCase();
        const combined = `${name} ${text} ${value}`;
        const looksEmailField = combined.includes("email")
          || combined.includes("e-mail")
          || combined.includes("username")
          || combined.includes("user name")
          || combined.includes("jobstreet email")
          || combined.includes("alamat email");
        return role.includes("textbox") && looksEmailField;
      }) ?? null;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        settleAttempts = attempt;

        if (result.state === "unknown" && String(result.currentUrl || "").trim().toLowerCase() === "about:blank") {
          recoveryAttempted = true;
          await writeAutomationLog({
            campaignId,
            event: "mcp.resume_blank_snapshot_detected",
            message: "Snapshot session check resume berada di about:blank. Recovery navigate ke target apply URL dijalankan.",
            metadata: {
              attempt,
              targetUrl: resolvedJobUrl,
              applyTargetUrl,
              diagnostics: client.getSessionDiagnostics(),
              initialResult: result,
            },
          }).catch(() => undefined);

          await client.navigate(applyTargetUrl);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          snapshot = await client.snapshot();
          result = analyzeJobstreetSessionSnapshot(snapshot);
          if (result.state !== "unknown") {
            lastActionableResult = result;
          }
          continue;
        }

        if (result.state === "email_required") {
          const emailElement = findVisibleEmailElement();
          if (emailElement && !emailFillCompleted) {
            emailFillAttempted = true;
            await writeAutomationLog({
              campaignId,
              event: "jobstreet.login_email_fill_started",
              message: "Field email login Jobstreet terlihat saat resume. Sistem mengisi email aman tanpa menyentuh password/OTP.",
              metadata: {
                currentUrl: result.currentUrl,
                elementId: emailElement.elementId,
                applyTargetUrl,
              },
            }).catch(() => undefined);

            const emailToFill = process.env.JOBSTREET_EMAIL || "bayu.farid36@gmail.com";
            await client.fill(emailElement.elementId, emailToFill);
            emailFillCompleted = true;

            await writeAutomationLog({
              campaignId,
              event: "auth.email_filled",
              message: `Email filled automatically during resume.`,
              metadata: { currentUrl: result.currentUrl },
            }).catch(() => undefined);

            // Try to find and click "Continue" button
            const continueButton = snapshot.elements.find((el) => {
              const name = String(el.name ?? "").toLowerCase();
              const text = String(el.text ?? "").toLowerCase();
              return (el.role === "button" || el.role === "link") && (name.includes("continue") || text.includes("continue") || name.includes("lanjut") || text.includes("lanjut") || name.includes("next") || text.includes("next"));
            });

            if (continueButton) {
              await client.click(continueButton.elementId);
              await writeAutomationLog({
                campaignId,
                event: "auth.login_continue_clicked",
                message: "Tombol Continue diklik otomatis setelah isi email saat resume.",
                metadata: { currentUrl: result.currentUrl },
              }).catch(() => undefined);
            } else {
              // Fallback: press Enter
              await client.fill(emailElement.elementId, emailToFill + "\n");
              await writeAutomationLog({
                campaignId,
                event: "auth.login_continue_clicked",
                message: "Enter ditekan otomatis setelah isi email saat resume (tombol Continue tidak ditemukan).",
                metadata: { currentUrl: result.currentUrl },
              }).catch(() => undefined);
            }

            await writeAutomationLog({
              campaignId,
              event: "jobstreet.login_email_fill_done",
              message: "Email login Jobstreet berhasil diisi saat resume. Browser visible tetap menunggu langkah manual user.",
              metadata: {
                currentUrl: result.currentUrl,
                applyTargetUrl,
              },
            }).catch(() => undefined);

            snapshot = await client.waitForChange(snapshot, 2500);
            result = analyzeJobstreetSessionSnapshot(snapshot);
          }
        }

        if ((result.state !== "unknown" && !(result.state === "email_required" && emailFillCompleted && attempt < 3)) || attempt === 3) {
          break;
        }

        snapshot = await client.waitForChange(snapshot, 2500);
        result = analyzeJobstreetSessionSnapshot(snapshot);
        if (result.state !== "unknown") {
          lastActionableResult = result;
        }
      }

      if (result.state === "unknown" && lastActionableResult) {
        result = {
          ...lastActionableResult,
          evidence: [...lastActionableResult.evidence, "Snapshot akhir kembali tidak stabil, tetapi state non-blank terakhir dipertahankan sebagai blocker yang lebih kuat."],
        };
      }

      if (result.state === "authenticated") {
        await writeAutomationLog({
          campaignId,
          event: "jobstreet.session_authenticated",
          message: "Sesi Jobstreet terverifikasi dan siap melanjutkan direct apply.",
          metadata: {
            state: result.state,
            currentUrl: result.currentUrl,
            evidence: result.evidence,
            applyTargetUrl,
            recoveryAttempted,
            emailFillAttempted,
            emailFillCompleted,
            settleAttempts,
          },
        }).catch(() => undefined);

        await setCampaignRuntimeState(campaignId, {
          status: "running",
          currentStep: "decision_resolved",
          decisionStatus: null,
          decisionPayloadJson: null,
          currentQuestion: null,
          currentJobId: activeJob?.id ?? null,
          currentJobTitle: activeJob?.title ?? null,
          currentJobCompany: activeJob?.company ?? null,
        });

        await prisma.jobListing.updateMany({
          where: { id: activeJob?.id ?? "__missing__" },
          data: {
            status: "shortlisted",
            applyUrl: applyTargetUrl,
          },
        });

        await writeAutomationLog({
          campaignId,
          jobListingId: activeJob?.id ?? undefined,
          event: "campaign.resume_direct_apply_after_login",
          message: "Sesi valid. Direct apply Jobstreet akan dilanjutkan tanpa kembali ke search.",
          metadata: {
            jobListingId: activeJob?.id ?? null,
            jobTitle: activeJob?.title ?? null,
            jobUrl: resolvedJobUrl,
            applyTargetUrl,
          },
        }).catch(() => undefined);

        return {
          status: "safe_continue" as const,
          message: "Sesi Jobstreet valid. Klik Lanjutkan untuk meneruskan direct apply tanpa kembali ke search.",
        };
      }

      const stillNeedsOtp = result.state === "otp_required";
      await writeAutomationLog({
        campaignId,
        level: "warn",
        event: stillNeedsOtp ? "jobstreet.session_still_requires_otp" : "jobstreet.session_invalid",
        message: stillNeedsOtp
          ? "Sesi Jobstreet masih meminta OTP. Kampanye tetap dijeda."
          : "Sesi Jobstreet belum valid untuk melanjutkan autopilot.",
        metadata: {
          state: result.state,
          currentUrl: result.currentUrl,
          evidence: result.evidence,
          applyTargetUrl,
          recoveryAttempted,
          emailFillAttempted,
          emailFillCompleted,
          settleAttempts,
        },
      }).catch(() => undefined);

      const pausedDecisionType = result.state === "otp_required"
        ? "otp_required"
        : result.state === "email_required"
          ? "email_required"
          : result.state === "security_or_challenge"
            ? "security_or_challenge"
            : "manual_intervention";

      await setCampaignRuntimeState(campaignId, {
        status: "paused",
        currentStep: "manual_intervention",
        currentQuestion:
          pausedDecisionType === "otp_required"
            ? "Masukkan OTP 6 digit langsung di browser Jobstreet yang terbuka. Setelah berhasil login, klik tombol Lanjutkan dari aplikasi."
            : "Selesaikan login atau verifikasi keamanan di browser Jobstreet yang terbuka, lalu klik Lanjutkan dari aplikasi.",
        decisionStatus: pausedDecisionType,
        decisionPayloadJson: JSON.stringify({
          type: pausedDecisionType,
          jobId: activeJob?.id ?? null,
          applicationId,
          message:
            pausedDecisionType === "otp_required"
              ? "Masukkan OTP 6 digit langsung di browser Jobstreet yang terbuka. Setelah berhasil login, klik tombol Lanjutkan dari aplikasi."
              : "Selesaikan login atau verifikasi keamanan di browser Jobstreet yang terbuka, lalu klik Lanjutkan dari aplikasi.",
          blockerEvidence: {
            reason: pausedDecisionType,
            currentUrl: result.currentUrl,
            evidence: result.evidence,
            applyTargetUrl,
            recoveryAttempted,
            emailFillAttempted,
            emailFillCompleted,
            settleAttempts,
          },
        }),
      });

      return {
        status: "paused" as const,
        message:
          pausedDecisionType === "otp_required"
            ? "OTP masih diperlukan. Kampanye tetap dijeda tanpa menyimpan OTP."
            : "Sesi Jobstreet belum valid. Kampanye tetap dijeda sampai login/verifikasi selesai.",
      };
    } catch (error) {
      await setCampaignRuntimeState(campaignId, {
        status: "paused",
        currentStep: "manual_intervention",
        decisionStatus: "manual_intervention",
        currentQuestion: "Validasi sesi login Jobstreet gagal. Cek browser visible dan MCP, lalu coba lagi.",
        decisionPayloadJson: JSON.stringify({
          type: "manual_intervention",
          jobId,
          applicationId,
          message: "Validasi sesi login Jobstreet gagal. Cek browser visible dan MCP, lalu coba lagi.",
          blockerEvidence: {
            reason: "manual_intervention",
            error: error instanceof Error ? error.message : "Resume after login gagal.",
          },
        }),
      });

      throw error;
    }
  }

  if (!jobId && !applicationId) {
    throw new Error("Tidak ada keputusan aktif yang bisa diproses.");
  }

  if ((decisionType === "question_required" || decisionType === "submit_unverified") && applicationId) {
    if (input.action === "skip") {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "skipped",
          skippedReason:
            decisionType === "question_required"
              ? "User memilih melewati lowongan karena pertanyaan perlu jawaban manual."
              : "User memilih melewati lowongan karena submit belum terverifikasi.",
        },
      });

      if (jobId) {
        await prisma.jobListing.update({ where: { id: jobId }, data: { status: "skipped" } });
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
        message: "Lowongan dilewati sesuai keputusan Anda.",
      };
    }

    if (["accept", "yes", "edit_answer", "reject", "no"].includes(input.action)) {
      await setCampaignRuntimeState(campaignId, {
        status: "running",
        currentStep: "decision_resolved",
        decisionStatus: null,
        decisionPayloadJson: null,
        currentQuestion: null,
      });

      return {
        status: "safe_continue" as const,
        message:
          decisionType === "question_required"
            ? input.action === "edit_answer"
              ? "Jawaban akan diedit di aplikasi lalu kampanye bisa dilanjutkan."
              : "Keputusan jawaban disimpan. Lanjutkan kampanye untuk meneruskan apply."
            : "Keputusan submit disimpan. Lanjutkan kampanye untuk verifikasi ulang atau proses berikutnya.",
      };
    }
  }

  if (!jobId) {
    throw new Error("Keputusan ini membutuhkan lowongan aktif.");
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
