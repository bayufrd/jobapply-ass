import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
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

  if (!campaign) {
    return NextResponse.json({ ok: false, error: "Kampanye tidak ditemukan." }, { status: 404 });
  }

  const decisionPayload = parseJson<Record<string, unknown> | null>(campaign.decisionPayloadJson, null);
  const latestApplication = campaign.applications[0] ?? null;
  const latestSuccessLog = campaign.logs.find((log) => log.event === "application.submit_success_marker_detected") ?? null;
  const latestSuccessMetadata = parseJson<Record<string, unknown> | null>(latestSuccessLog?.metadataJson, null);
  const currentJob =
    campaign.currentJobId
      ? campaign.jobListings.find((item) => item.id === campaign.currentJobId) ?? null
      : null;
  const lastAiPlanLog = campaign.logs.find((log) => log.event === "mcp_ai.plan_received") ?? null;
  const lastSnapshotLog = campaign.logs.find((log) => log.event.startsWith("mcp_ai.snapshot_")) ?? null;
  const blockerType = typeof decisionPayload?.type === "string" ? decisionPayload.type : campaign.decisionStatus;
  const blockerEvidence = parseJson<Record<string, unknown> | null>(
    typeof latestApplication?.notes === "string" && latestApplication.notes.trim().startsWith("{") ? latestApplication.notes : null,
    (decisionPayload?.blockerEvidence as Record<string, unknown> | null) ?? null,
  );
  const blocker =
    campaign.status === "error"
      ? {
          type: "error",
          message: campaign.logs[0]?.message ?? "Terjadi error kampanye.",
          evidence: blockerEvidence,
        }
      : blockerType
        ? {
            type: blockerType,
            message: campaign.currentQuestion ?? latestApplication?.notes ?? "Kampanye berhenti pada state terkontrol.",
            evidence: blockerEvidence,
          }
        : null;

  return NextResponse.json({
    ok: true,
    campaignId: id,
    status: campaign.status,
    campaignStatus: campaign.status,
    currentStep: campaign.currentStep,
    currentJobId: campaign.currentJobId,
    currentJob,
    appliedCount: campaign.appliedCount,
    verifiedSubmittedCount: campaign.applications.filter((item) => item.status === "submitted").length,
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
    latestLogs: campaign.logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      level: log.level,
      event: log.event,
      message: log.message,
      jobTitle: log.jobListing?.title ?? null,
    })),
    localLogPath: `storage/logs/campaign-${id}.log`,
    blocker,
    blockerType,
    blockerEvidence,
    decisionType: typeof decisionPayload?.type === "string" ? decisionPayload.type : campaign.decisionStatus,
    decisionPayload,
    lastAiPlan: parseJson(lastAiPlanLog?.metadataJson, null),
    lastMcpSnapshotPreview: parseJson(lastSnapshotLog?.metadataJson, null),
    lastSuccessMarker:
      typeof latestSuccessMetadata?.successMarker === "string"
        ? latestSuccessMetadata.successMarker
        : null,
    appliedJobsVerification: {
      before: parseJson<number | null>(campaign.logs.find(l => l.event === "qa.applied_jobs_baseline")?.metadataJson, null),
      after: parseJson<number | null>(campaign.logs.find(l => l.event === "qa.applied_jobs_after_submit")?.metadataJson, null),
      expectedMinimum: null, // Will be calculated by consumer or added to log
      verified: campaign.applications.some(a => a.status === "submitted"),
      lastCheckedAt: campaign.logs.find(l => l.event.startsWith("qa.applied_jobs_"))?.createdAt.toISOString() ?? null,
    },
  });
}
