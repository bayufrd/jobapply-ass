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
      jobListings: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      applications: {
        include: {
          jobListing: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      logs: {
        include: {
          jobListing: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Kampanye tidak ditemukan." }, { status: 404 });
  }

  const lastMcpPageKindLog = campaign.logs.find((log) => log.event === "mcp_ai.page_kind_detected") ?? null;
  const lastMcpPlanLog = campaign.logs.find((log) => log.event === "mcp_ai.plan_received") ?? null;
  const lastMcpActionLog = campaign.logs.find(
    (log) => log.event === "mcp_ai.action_executed" || log.event === "mcp_ai.final_submit_clicked",
  ) ?? null;

  const lastMcpPageKindMetadata = parseJson<Record<string, unknown> | null>(lastMcpPageKindLog?.metadataJson, null);
  const lastMcpPlanMetadata = parseJson<Record<string, unknown> | null>(lastMcpPlanLog?.metadataJson, null);
  const lastMcpActionMetadata = parseJson<Record<string, unknown> | null>(lastMcpActionLog?.metadataJson, null);

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      currentStep: campaign.currentStep,
      currentQuestion: campaign.currentQuestion,
      decisionStatus: campaign.decisionStatus,
      formAutomationMode: campaign.formAutomationMode,
      appliedCount: campaign.appliedCount,
      targetApplyCount: campaign.targetApplyCount,
    },
    currentJob: campaign.jobListings[0]
      ? {
          id: campaign.jobListings[0].id,
          title: campaign.jobListings[0].title,
          company: campaign.jobListings[0].company,
          status: campaign.jobListings[0].status,
          url: campaign.jobListings[0].url,
        }
      : null,
    latestApplication: campaign.applications[0]
      ? {
          id: campaign.applications[0].id,
          status: campaign.applications[0].status,
          submittedAt: campaign.applications[0].submittedAt,
          notes: campaign.applications[0].notes,
          jobTitle: campaign.applications[0].jobListing.title,
          jobCompany: campaign.applications[0].jobListing.company,
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
    mcp: {
      lastPageKind: lastMcpPageKindMetadata?.pageKind ?? null,
      visibleButtons: Array.isArray(lastMcpPageKindMetadata?.buttons) ? lastMcpPageKindMetadata?.buttons : [],
      questions: Array.isArray(lastMcpPageKindMetadata?.questions) ? lastMcpPageKindMetadata?.questions : [],
      submitCandidates: Array.isArray(lastMcpPageKindMetadata?.submitCandidates)
        ? lastMcpPageKindMetadata?.submitCandidates
        : [],
    },
    ai: {
      lastPlanGoal:
        lastMcpPlanMetadata?.plan &&
        typeof lastMcpPlanMetadata.plan === "object" &&
        "goal" in lastMcpPlanMetadata.plan
          ? (lastMcpPlanMetadata.plan as Record<string, unknown>).goal
          : null,
      lastPlan:
        lastMcpPlanMetadata?.plan && typeof lastMcpPlanMetadata.plan === "object"
          ? lastMcpPlanMetadata.plan
          : null,
      lastAction:
        lastMcpActionMetadata?.action && typeof lastMcpActionMetadata.action === "object"
          ? lastMcpActionMetadata.action
          : null,
    },
  });
}
