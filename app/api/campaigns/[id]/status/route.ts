import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { canContinueAutopilot, canStartAutopilot, isCampaignTerminal } from "@/lib/campaign/campaign-state";

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
    "campaign.autopilot_job_apply_unavailable": "Lowongan dilewati karena tombol lamar tidak ditemukan. Lanjut ke lowongan berikutnya.",
    "campaign.loop_next_job": "Autopilot memilih lowongan berikutnya.",
    "application.review_required": "Lamaran siap direview sebelum submit.",
    "application.question_needs_user_input": "Autopilot menunggu jawaban Anda untuk pertanyaan lowongan.",
    "application.submitted": "Lamaran berhasil terkirim.",
    "application.submit_failed": "Submit lamaran gagal diverifikasi.",
    "ai_ui.fallback_started": "Sistem beralih ke AI UI Agent karena flow deterministic stuck.",
    "ai_ui.observe_started": "AI UI Agent mulai membaca tampilan form.",
    "ai_ui.snapshot_captured": "Snapshot DOM aman berhasil diambil untuk AI.",
    "ai_ui.plan_received": "AI mengembalikan rencana aksi berikutnya.",
    "ai_ui.action_executed": "Aksi AI berhasil dijalankan di browser.",
    "ai_ui.ask_user_required": "AI membutuhkan jawaban Anda untuk melanjutkan.",
    "ai_ui.final_submit_detected": "AI mendeteksi submit final yang aman.",
    "ai_ui.submitted_verified": "Submit final berhasil diverifikasi oleh AI UI Agent.",
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

  const runtimeCampaign = campaign as typeof campaign & {
    currentJobId?: string | null;
    currentStep?: string | null;
    currentQuestion?: string | null;
    decisionStatus?: string | null;
    decisionPayloadJson?: string | null;
  };

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

  const currentJob = runtimeCampaign.currentJobId
    ? campaign.jobListings.find((job) => job.id === runtimeCampaign.currentJobId) ?? null
    : null;

  const latestAiLog = campaign.logs.find((log) => log.event.startsWith("ai_ui.")) ?? null;
  const latestAiMetadata = parseJson<Record<string, unknown> | null>(latestAiLog?.metadataJson, null);

  return NextResponse.json({
    campaign,
    counts,
    currentStep: runtimeCampaign.currentStep,
    currentJob,
    aiUi: {
      currentAction: latestAiMetadata?.goal ?? latestAiLog?.event ?? null,
      reason: latestAiMetadata?.userFacingReason ?? runtimeCampaign.currentQuestion ?? null,
      targetElementId: latestAiMetadata?.targetElementId ?? null,
      snapshotSummary: latestAiMetadata?.snapshotSummary ?? null,
      pausedReason: campaign.status === "paused" ? (runtimeCampaign.currentQuestion ?? runtimeCampaign.decisionStatus ?? null) : null,
    },
    lastDecisionRequired: parseJson(runtimeCampaign.decisionPayloadJson, null),
    latestLogs: campaign.logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      level: log.level,
      event: log.event,
      message: log.message,
      readableMessage: translateEvent(log.event),
      jobTitle: log.jobListing?.title ?? null,
    })),
    canContinue: canContinueAutopilot(campaign.status) || canStartAutopilot(campaign.status),
    nextRecommendedAction:
      campaign.status === "paused" && runtimeCampaign.decisionStatus === "low_score"
        ? "decision_required"
        : campaign.status === "paused" && runtimeCampaign.decisionStatus === "question_required"
          ? "question_required"
          : campaign.status === "paused" && runtimeCampaign.decisionStatus === "review_required"
            ? "review_required"
            : campaign.appliedCount >= campaign.targetApplyCount || isCampaignTerminal(campaign.status)
              ? "completed"
              : "safe_continue",
  });
}
