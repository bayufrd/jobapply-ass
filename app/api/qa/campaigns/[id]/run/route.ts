import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runCampaignAutopilot } from "@/lib/campaign/autopilot-runner";
import { writeAutomationLog } from "@/lib/logging/automation-log";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

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
      return NextResponse.json({ ok: false, error: "Kampanye tidak ditemukan." }, { status: 404 });
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
      ? parseJson<Record<string, unknown> | null>(refreshed.decisionPayloadJson, null)
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
    const blockerEvidence = parseJson<Record<string, unknown> | null>(
      typeof latestApplication?.notes === "string" && latestApplication.notes.trim().startsWith("{") ? latestApplication.notes : null,
      (decisionRequired?.blockerEvidence as Record<string, unknown> | null) ?? null,
    );

    return NextResponse.json({
      ok: true,
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
      lastAiPlan: parseJson(lastMcpPlanLog?.metadataJson, null),
      lastMcpSnapshotPreview: parseJson(lastMcpSnapshotLog?.metadataJson, null),
      latestLogs,
      localLogPath: `storage/logs/campaign-${id}.log`,
      result,
    }, { status: result.status === "error" ? 500 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Gagal menjalankan QA campaign.",
      },
      { status: 500 },
    );
  }
}
