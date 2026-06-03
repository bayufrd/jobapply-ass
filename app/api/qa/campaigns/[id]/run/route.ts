import { prisma } from "@/lib/db/prisma";
import { runCampaignAutopilot } from "@/lib/campaign/autopilot-runner";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { safeJsonParse } from "@/lib/utils/safe-json";
import { jsonControlled, jsonError, jsonOk } from "@/lib/api/json-response";
import { buildJobstreetApplyUrl, extractJobstreetJobId } from "@/lib/jobstreet/jobstreet-url";

type RunBody = {
  targetSubmissions?: number;
  forceMcpAiFirst?: boolean;
  forceAutoSubmitSafeOnly?: boolean;
  forceApplyLowScore?: boolean;
  forceDirectApply?: boolean;
  directJobUrl?: string;
  directJobId?: string;
  quickApplyAvailable?: boolean;
  resumeAfterManual?: boolean;
};

function normalizeDirectApplyInput(body: RunBody) {
  if (!body.forceDirectApply) {
    return null;
  }

  const directJobUrl = typeof body.directJobUrl === "string" ? body.directJobUrl.trim() : "";
  const directJobId = typeof body.directJobId === "string" ? body.directJobId.trim() : "";
  const resolvedJobId = directJobId || (directJobUrl ? extractJobstreetJobId(directJobUrl) : null);

  if (!resolvedJobId) {
    throw new Error("Direct apply QA membutuhkan job ID atau Jobstreet job URL yang valid.");
  }

  const canonicalJobUrl = directJobUrl || `https://id.jobstreet.com/id/job/${resolvedJobId}`;

  return {
    jobId: resolvedJobId,
    jobUrl: canonicalJobUrl,
    applyUrl: buildJobstreetApplyUrl(resolvedJobId),
    quickApplyAvailable: body.quickApplyAvailable ?? true,
  };
}

async function seedDirectApplyJob(input: {
  campaignId: string;
  directApply: NonNullable<ReturnType<typeof normalizeDirectApplyInput>>;
}) {
  const existing = await prisma.jobListing.findFirst({
    where: {
      OR: [
        { url: input.directApply.jobUrl },
        { jobstreetJobId: input.directApply.jobId },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  await writeAutomationLog({
    campaignId: input.campaignId,
    jobListingId: existing?.id ?? null,
    event: "qa.direct_apply_seed_started",
    message: "QA direct apply seed dimulai untuk lowongan Jobstreet tertentu.",
    metadata: {
      campaignId: input.campaignId,
      jobstreetJobId: input.directApply.jobId,
      jobUrl: input.directApply.jobUrl,
      applyUrl: input.directApply.applyUrl,
      existingJobListingId: existing?.id ?? null,
      existingStatus: existing?.status ?? null,
      previousCampaignId: existing?.campaignId ?? null,
    },
  });

  const seededJob = existing
    ? await prisma.jobListing.update({
        where: { id: existing.id },
        data: {
          campaignId: input.campaignId,
          source: "jobstreet",
          jobstreetJobId: input.directApply.jobId,
          url: input.directApply.jobUrl,
          applyUrl: input.directApply.applyUrl,
          quickApplyAvailable: input.directApply.quickApplyAvailable,
          searchPage: 0,
          status: "shortlisted",
          matchScore: 100,
          matchReason: "QA forced direct apply seed.",
        },
      })
    : await prisma.jobListing.create({
        data: {
          campaignId: input.campaignId,
          source: "jobstreet",
          title: `QA Direct Apply ${input.directApply.jobId}`,
          company: "Jobstreet Direct Apply Target",
          url: input.directApply.jobUrl,
          applyUrl: input.directApply.applyUrl,
          jobstreetJobId: input.directApply.jobId,
          quickApplyAvailable: input.directApply.quickApplyAvailable,
          searchPage: 0,
          matchScore: 100,
          matchReason: "QA forced direct apply seed.",
          status: "shortlisted",
        },
      });

  await writeAutomationLog({
    campaignId: input.campaignId,
    jobListingId: seededJob.id,
    event: "qa.direct_apply_seed_done",
    message: "QA direct apply seed selesai dan lowongan dibuat eligible untuk fase apply.",
    metadata: {
      campaignId: input.campaignId,
      jobListingId: seededJob.id,
      jobstreetJobId: seededJob.jobstreetJobId,
      url: seededJob.url,
      applyUrl: seededJob.applyUrl,
      quickApplyAvailable: seededJob.quickApplyAvailable,
      status: seededJob.status,
      searchPage: seededJob.searchPage,
    },
  });

  return seededJob;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as RunBody;
    const directApply = normalizeDirectApplyInput(body);

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return jsonError("campaign_not_found", "Kampanye tidak ditemukan.", undefined, { status: 404 });
    }

    const shouldForceRestart = ["completed", "error", "stopped"].includes(campaign.status);

    await prisma.campaign.update({
      where: { id },
      data: {
        targetApplyCount: typeof body.targetSubmissions === "number" && body.targetSubmissions > 0
          ? body.targetSubmissions
          : campaign.targetApplyCount,
        formAutomationMode: body.forceMcpAiFirst === false ? campaign.formAutomationMode : "mcp_ai_first",
        automationMode:
          body.forceAutoSubmitSafeOnly === false ? campaign.automationMode : "auto_submit_safe_only",
        autoSubmitSafeOnly: body.forceAutoSubmitSafeOnly === false ? campaign.autoSubmitSafeOnly : true,
        lowScoreMode: body.forceApplyLowScore ? "auto_apply" : campaign.lowScoreMode,
        currentStep: null,
        currentJobId: directApply ? "qa_direct_apply_pending" : null,
        currentQuestion: null,
        decisionStatus: null,
        decisionPayloadJson: directApply
          ? JSON.stringify({
              type: "qa_direct_apply_seed",
              forceDirectApply: true,
              directJobId: directApply.jobId,
              directJobUrl: directApply.jobUrl,
              directApplyUrl: directApply.applyUrl,
            })
          : null,
        currentJobTitle: null,
        currentJobCompany: null,
        currentSearchPage: shouldForceRestart ? 1 : campaign.currentSearchPage,
        currentSearchUrl: shouldForceRestart ? null : campaign.currentSearchUrl,
        processedJobCount: shouldForceRestart ? 0 : campaign.processedJobCount,
        unusableJobCount: shouldForceRestart ? 0 : campaign.unusableJobCount,
        emptyPageCount: shouldForceRestart ? 0 : campaign.emptyPageCount,
        lastAppliedJobstreetJobId: shouldForceRestart ? null : campaign.lastAppliedJobstreetJobId,
        status: shouldForceRestart ? "running" : campaign.status,
      },
    });

    if (directApply) {
      await seedDirectApplyJob({
        campaignId: id,
        directApply,
      });
    }

    await writeAutomationLog({
      campaignId: id,
      event: body.resumeAfterManual
        ? "campaign.resume_after_manual_intervention_started"
        : "campaign.qa_run_requested",
      message: body.resumeAfterManual
        ? "QA autopilot melanjutkan ulang setelah intervensi manual dengan payload direct apply tetap dipertahankan."
        : "QA autopilot memaksa mode MCP AI First dan auto submit aman.",
      metadata: {
        targetSubmissions: body.targetSubmissions ?? campaign.targetApplyCount,
        forceMcpAiFirst: body.forceMcpAiFirst ?? true,
        forceAutoSubmitSafeOnly: body.forceAutoSubmitSafeOnly ?? true,
        forceApplyLowScore: body.forceApplyLowScore ?? false,
        forceDirectApply: body.forceDirectApply ?? false,
        directJobId: directApply?.jobId ?? null,
        directJobUrl: directApply?.jobUrl ?? null,
        directApplyUrl: directApply?.applyUrl ?? null,
        resumeAfterManual: body.resumeAfterManual ?? false,
        previousStatus: campaign.status,
        forceRestarted: shouldForceRestart,
        resetRuntimeState: shouldForceRestart
          ? {
              currentSearchPage: 1,
              currentSearchUrl: null,
              processedJobCount: 0,
              unusableJobCount: 0,
              emptyPageCount: 0,
              lastAppliedJobstreetJobId: null,
            }
          : null,
      },
    });

    const result = await runCampaignAutopilot(id);
    const refreshed = await prisma.campaign.findUnique({
      where: { id },
      include: {
        jobListings: true,
        applications: {
          include: { jobListing: true },
          orderBy: { createdAt: "desc" },
        },
        logs: {
          include: { jobListing: true },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    const verifiedSubmittedCount = refreshed?.applications.filter((item) => item.status === "submitted").length ?? 0;
    const decisionRequired = refreshed?.decisionPayloadJson
      ? safeJsonParse<Record<string, unknown> | null>(refreshed.decisionPayloadJson, null, "qa_run.decision_payload")
      : result.decisionRequired ?? null;
    const latestApplication = refreshed?.applications[0] ?? null;
    const currentJob = refreshed?.currentJobId
      ? refreshed.jobListings.find((item) => item.id === refreshed.currentJobId) ?? null
      : null;
    const lastMcpPlanLog = refreshed?.logs.find((log) => log.event === "mcp_ai.plan_received") ?? null;
    const lastMcpSnapshotLog = refreshed?.logs.find((log) => log.event.startsWith("mcp_ai.snapshot_")) ?? null;
    const latestLogs = refreshed?.logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      level: log.level,
      event: log.event,
      message: log.message,
      jobTitle: log.jobListing?.title ?? null,
    })) ?? [];
    const blockerType = typeof decisionRequired?.type === "string" ? decisionRequired.type : result.status;
    const blockerEvidence = safeJsonParse<Record<string, unknown> | null>(
      typeof latestApplication?.notes === "string" && latestApplication.notes.trim().startsWith("{") ? latestApplication.notes : null,
      (decisionRequired?.blockerEvidence as Record<string, unknown> | null) ?? null,
      "qa_run.latest_application_notes",
    );

    const payload = {
      campaignId: id,
      status: result.status === "error" ? "failed" : result.status,
      campaignStatus: refreshed?.status ?? null,
      appliedCount: refreshed?.appliedCount ?? 0,
      verifiedSubmittedCount,
      message: result.message,
      currentStep: refreshed?.currentStep ?? result.currentStep ?? null,
      currentJobId: refreshed?.currentJobId ?? result.currentJobId ?? null,
      currentJob,
      decisionRequired,
      blockerType,
      blockerEvidence,
      latestApplication:
        latestApplication
          ? {
              id: latestApplication.id,
              status: latestApplication.status,
              submittedAt: latestApplication.submittedAt,
              notes: latestApplication.notes,
              jobTitle: latestApplication.jobListing?.title ?? null,
              company: latestApplication.jobListing?.company ?? null,
              url: latestApplication.jobListing?.url ?? null,
            }
          : null,
      lastAiPlan: safeJsonParse(lastMcpPlanLog?.metadataJson, null, "qa_run.last_ai_plan"),
      lastMcpSnapshotPreview: safeJsonParse(lastMcpSnapshotLog?.metadataJson, null, "qa_run.last_snapshot_preview"),
      latestLogs,
      localLogPath: `storage/logs/campaign-${id}.log`,
      result,
    };

    if (result.status === "error") {
      return jsonError("qa_campaign_run_failed", result.message, payload, { status: 500 });
    }

    if (["manual_intervention_required", "question_required", "decision_required", "mcp_unavailable", "mcp_browser_unavailable", "submit_unverified", "apply_unavailable", "stuck_no_progress", "paused", "completed"].includes(result.status)) {
      return jsonControlled(payload);
    }

    return jsonOk(payload);
  } catch (error) {
    return jsonError(
      "qa_campaign_run_failed",
      error instanceof Error ? error.message : "Gagal menjalankan QA campaign.",
      undefined,
      { status: 500 },
    );
  }
}
