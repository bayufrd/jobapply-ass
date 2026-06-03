import { prisma } from "@/lib/db/prisma";
import { runCampaignAutopilot } from "@/lib/campaign/autopilot-runner";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { safeJsonParse } from "@/lib/utils/safe-json";
import { jsonControlled, jsonError, jsonOk } from "@/lib/api/json-response";

type RunBody = {
  targetSubmissions?: number;
  forceMcpAiFirst?: boolean;
  forceAutoSubmitSafeOnly?: boolean;
  forceApplyLowScore?: boolean;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as RunBody;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return jsonError("campaign_not_found", "Kampanye tidak ditemukan.", undefined, { status: 404 });
    }

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
        currentJobId: null,
        currentQuestion: null,
        decisionStatus: null,
        decisionPayloadJson: null,
        currentJobTitle: null,
        currentJobCompany: null,
        status: campaign.status === "stopped" ? "running" : campaign.status,
      },
    });

    await writeAutomationLog({
      campaignId: id,
      event: "campaign.qa_run_requested",
      message: "QA autopilot memaksa mode MCP AI First dan auto submit aman.",
      metadata: {
        targetSubmissions: body.targetSubmissions ?? campaign.targetApplyCount,
        forceMcpAiFirst: body.forceMcpAiFirst ?? true,
        forceAutoSubmitSafeOnly: body.forceAutoSubmitSafeOnly ?? true,
        forceApplyLowScore: body.forceApplyLowScore ?? false,
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
