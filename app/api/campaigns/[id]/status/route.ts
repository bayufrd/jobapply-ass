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

function translateEvent(event: string) {
  const map: Record<string, string> = {
    "campaign.autopilot_search_started": "Autopilot mulai mencari lowongan baru.",
    "campaign.autopilot_auto_skip": "Lowongan dilewati otomatis oleh aturan kampanye.",
    "campaign.loop_next_job": "Autopilot memilih lowongan berikutnya.",
    "application.review_required": "Lamaran siap direview sebelum submit.",
    "application.question_needs_user_input": "Autopilot menunggu jawaban Anda untuk pertanyaan lowongan.",
    "application.submitted": "Lamaran berhasil terkirim.",
    "application.submit_failed": "Submit lamaran gagal diverifikasi.",
  };

  return map[event] ?? event.replace(/\./g, " · ");
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
        take: 12,
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Kampanye tidak ditemukan." }, { status: 404 });
  }

  const counts = {
    jobsFound: campaign.jobListings.length,
    jobsAnalyzed: campaign.jobListings.filter((job) => job.matchScore !== null).length,
    aiSkipped: campaign.jobListings.filter((job) => job.status === "skipped").length,
    userForcedApply: campaign.logs.filter((log) => log.event === "campaign.decision.force_apply").length,
    applicationsProcessed: campaign.applications.length,
    waitingForUserAnswer: campaign.applications.filter((app) => app.status === "paused").length,
    waitingForReviewSubmit: campaign.applications.filter((app) => app.status === "pending_review").length,
    submitted: campaign.applications.filter((app) => app.status === "submitted").length,
    failed: campaign.applications.filter((app) => app.status === "failed").length,
  };

  const currentJob = campaign.currentJobId
    ? campaign.jobListings.find((job) => job.id === campaign.currentJobId) ?? null
    : null;

  return NextResponse.json({
    campaign,
    counts,
    currentStep: campaign.currentStep,
    currentJob,
    lastDecisionRequired: parseJson(campaign.decisionPayloadJson, null),
    latestLogs: campaign.logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      level: log.level,
      event: log.event,
      message: log.message,
      readableMessage: translateEvent(log.event),
      jobTitle: log.jobListing?.title ?? null,
    })),
    canContinue: campaign.status === "running" || campaign.status === "ready" || campaign.status === "paused",
    nextRecommendedAction:
      campaign.status === "paused" && campaign.decisionStatus === "low_score"
        ? "decision_required"
        : campaign.status === "paused" && campaign.decisionStatus === "question_required"
          ? "question_required"
          : campaign.status === "paused" && campaign.decisionStatus === "review_required"
            ? "review_required"
            : campaign.appliedCount >= campaign.targetApplyCount
              ? "completed"
              : "safe_continue",
  });
}
