import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { canContinueAutopilot, canStartAutopilot, isCampaignTerminal, isTerminalCampaignStep } from "@/lib/campaign/campaign-state";

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
    "mcp.preflight_started": "Memeriksa koneksi Playwright MCP sebelum menjalankan kampanye.",
    "mcp.preflight_ok": "Playwright MCP aktif dan bisa diakses.",
    "mcp.preflight_failed": "Playwright MCP tidak bisa diakses.",
    "mcp_ai.runner_started": "Runner MCP AI First dimulai.",
    "mcp_ai.connect_started": "Mulai koneksi ke Playwright MCP.",
    "mcp_ai.connect_ok": "Koneksi Playwright MCP berhasil.",
    "mcp_ai.connect_failed": "Koneksi Playwright MCP gagal.",
    "mcp_ai.navigate_started": "MCP mulai membuka halaman lowongan.",
    "mcp_ai.navigate_ok": "MCP berhasil membuka halaman lowongan.",
    "mcp_ai.snapshot_started": "MCP mulai mengambil snapshot halaman.",
    "mcp_ai.snapshot_ok": "Snapshot awal MCP berhasil diambil.",
    "mcp_ai.snapshot_captured": "Snapshot MCP berhasil diambil.",
    "mcp_ai.snapshot_failed": "Snapshot MCP gagal diambil.",
    "mcp_ai.page_kind_detected": "Jenis halaman MCP berhasil dideteksi.",
    "mcp_ai.plan_requested": "Planner AI MCP sedang diminta.",
    "mcp_ai.plan_received": "Planner AI MCP mengembalikan rencana aksi.",
    "mcp_ai.action_executed": "Aksi MCP berhasil dijalankan.",
    "mcp_ai.no_progress_detected": "Tidak ada progres yang terlihat setelah aksi MCP.",
    "mcp_ai.ask_user_required": "AI MCP membutuhkan keputusan Anda.",
    "mcp_ai.tool_call_failed": "Panggilan tool MCP gagal.",
    "mcp_ai.final_submit_detected": "Snapshot MCP mendeteksi kandidat submit akhir.",
    "mcp_ai.final_submit_clicked": "Submit akhir dijalankan melalui MCP.",
    "mcp_ai.submit_verified": "Lamaran berhasil diverifikasi oleh snapshot MCP.",
    "mcp_ai.submit_unverified": "Submit sudah diklik tetapi marker sukses MCP belum muncul.",
    "mcp_ai.runner_failed": "Runner MCP gagal dijalankan.",
    "mcp_ai.server_unavailable": "Playwright MCP belum aktif.",
    "campaign.phase_search_started": "Fase 1/3 dimulai: mencari dan menyimpan lowongan.",
    "campaign.phase_search_completed": "Fase 1/3 selesai: lowongan tersimpan.",
    "campaign.phase_apply_started": "Fase 2/3 dimulai: apply dengan MCP AI First.",
    "campaign.phase_apply_job_started": "Mulai apply ke lowongan saat ini.",
    "campaign.phase_apply_job_finished": "Apply untuk lowongan saat ini selesai.",
    "campaign.phase_next_job": "Fase 3/3: lanjut ke lowongan berikutnya.",
    "campaign.search_limit_info": "Batas pencarian awal autopilot ditampilkan.",
    "jobstreet_apply.step_detected": "Langkah apply Jobstreet berhasil dideteksi dari URL.",
    "jobstreet_apply.choose_documents_continue": "Langkah memilih dokumen terdeteksi dan sistem mencoba lanjut.",
    "jobstreet_apply.employer_questions_started": "Langkah pertanyaan employer terdeteksi.",
    "jobstreet_apply.employer_questions_answered": "Pertanyaan employer berhasil dijawab.",
    "jobstreet_apply.update_profile_continue": "Langkah update profil Jobstreet terdeteksi dan sistem mencoba lanjut.",
    "jobstreet_apply.review_submit_detected": "Langkah review dan submit Jobstreet terdeteksi.",
    "jobstreet_apply.submit_clicked": "Tombol submit application berhasil diklik.",
    "jobstreet_apply.success_detected": "Halaman success Jobstreet terdeteksi.",
    "jobstreet_apply.step_timeout": "Langkah Jobstreet melebihi batas waktu.",
    "jobstreet_apply.step_mismatch": "URL Jobstreet tidak cocok dengan langkah yang diharapkan.",
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
    stuck: campaign.jobListings.filter((job) => job.status === "failed").length,
    applyUnavailable: campaign.jobListings.filter((job) => job.status === "apply_unavailable").length,
    manualIntervention: campaign.logs.filter((log) => log.event === "mcp_ai.server_unavailable" || log.event === "manual_intervention").length,
    submitUnverified: campaign.logs.filter((log) => log.event === "mcp_ai.submit_unverified").length,
  };

  const currentJob = runtimeCampaign.currentJobId
    ? campaign.jobListings.find((job) => job.id === runtimeCampaign.currentJobId) ?? null
    : null;

  const latestAiLog = campaign.logs.find((log) => log.event.startsWith("mcp_ai.") || log.event.startsWith("ai_ui.")) ?? null;
  const latestAiMetadata = parseJson<Record<string, unknown> | null>(latestAiLog?.metadataJson, null);
  const lastMcpPageKindLog = campaign.logs.find((log) => log.event === "mcp_ai.page_kind_detected") ?? null;
  const lastMcpPageKindMetadata = parseJson<Record<string, unknown> | null>(lastMcpPageKindLog?.metadataJson, null);
  const lastMcpPlanLog = campaign.logs.find((log) => log.event === "mcp_ai.plan_received") ?? null;
  const lastMcpPlanMetadata = parseJson<Record<string, unknown> | null>(lastMcpPlanLog?.metadataJson, null);
  const latestWatchdogLog = campaign.logs.find((log) => log.event.startsWith("application.") || log.event.startsWith("campaign.autopilot_continue_after_stuck")) ?? null;
  const latestWatchdogMetadata = parseJson<Record<string, unknown> | null>(latestWatchdogLog?.metadataJson, null);
  const watchdogState = (latestWatchdogMetadata?.watchdog ?? null) as Record<string, unknown> | null;
  const isTerminalStep = isTerminalCampaignStep(runtimeCampaign.currentStep ?? "");
  const nextRecommendedAction =
    isTerminalStep || campaign.status === "completed"
      ? "completed"
      : campaign.status === "paused" && runtimeCampaign.decisionStatus === "low_score"
        ? "decision_required"
        : campaign.status === "paused" && runtimeCampaign.decisionStatus === "question_required"
          ? "question_required"
          : campaign.status === "paused" && runtimeCampaign.decisionStatus === "review_required"
            ? "review_required"
            : campaign.status === "paused" && runtimeCampaign.decisionStatus === "submit_unverified"
              ? "submit_unverified"
              : campaign.status === "paused" && runtimeCampaign.decisionStatus === "mcp_unavailable"
                ? "mcp_unavailable"
                : campaign.appliedCount >= campaign.targetApplyCount || isCampaignTerminal(campaign.status)
                  ? "completed"
                  : "safe_continue";

  const latestMcpFailureLog = campaign.logs.find((log) => log.event === "mcp.preflight_failed" || log.event === "mcp_ai.runner_failed") ?? null;
  const latestMcpFailureMetadata = parseJson<Record<string, unknown> | null>(latestMcpFailureLog?.metadataJson, null);
  const latestSuccessLog = campaign.logs.find((log) => log.event === "application.submit_success_marker_detected") ?? null;
  const latestSuccessMetadata = parseJson<Record<string, unknown> | null>(latestSuccessLog?.metadataJson, null);
  const latestApplication = campaign.applications[0] ?? null;
  const blocker =
    campaign.status === "error"
      ? {
          type: "error",
          message: campaign.logs[0]?.message ?? "Terjadi error kampanye.",
        }
      : runtimeCampaign.decisionStatus === "question_required"
        ? {
            type: "question_required",
            message: "Pertanyaan ditemukan. Pilih jawaban di modal ini untuk melanjutkan.",
          }
        : runtimeCampaign.decisionStatus === "manual_intervention"
          ? {
              type: "manual_intervention",
              message: runtimeCampaign.currentQuestion ?? "Butuh tindakan manual untuk login, captcha, OTP, atau verifikasi keamanan.",
            }
          : runtimeCampaign.decisionStatus === "submit_unverified"
            ? {
                type: "submit_unverified",
                message: "Belum sampai halaman sukses. QA dihentikan dan log sudah disimpan.",
              }
            : runtimeCampaign.decisionStatus === "mcp_unavailable" || runtimeCampaign.currentStep === "mcp_browser_unavailable"
              ? {
                  type: "mcp_browser_unavailable",
                  message: "Playwright MCP atau browser Chromium belum siap.",
                }
              : null;

  return NextResponse.json({
    campaign,
    counts,
    appliedCount: campaign.appliedCount,
    verifiedSubmittedCount: counts.submitted,
    currentStep: runtimeCampaign.currentStep,
    currentJob,
    latestApplication:
      latestApplication
        ? {
            id: latestApplication.id,
            status: latestApplication.status,
            submittedAt: latestApplication.submittedAt,
            notes: latestApplication.notes,
            jobTitle: latestApplication.jobListing?.title ?? null,
            company: latestApplication.jobListing?.company ?? null,
          }
        : null,
    aiUi: {
      currentAction: latestAiMetadata?.goal ?? latestAiLog?.event ?? null,
      reason: latestAiMetadata?.userFacingReason ?? runtimeCampaign.currentQuestion ?? null,
      targetElementId: latestAiMetadata?.targetElementId ?? null,
      snapshotSummary: latestAiMetadata?.snapshotSummary ?? null,
      pausedReason: campaign.status === "paused" ? (runtimeCampaign.currentQuestion ?? runtimeCampaign.decisionStatus ?? null) : null,
    },
    mcp: {
      lastPageKind: lastMcpPageKindMetadata?.pageKind ?? null,
      visibleButtons: Array.isArray(lastMcpPageKindMetadata?.buttons) ? lastMcpPageKindMetadata?.buttons : [],
      questions: Array.isArray(lastMcpPageKindMetadata?.questions) ? lastMcpPageKindMetadata?.questions : [],
      submitCandidates: Array.isArray(lastMcpPageKindMetadata?.submitCandidates) ? lastMcpPageKindMetadata?.submitCandidates : [],
      lastPlanGoal: lastMcpPlanMetadata?.plan && typeof lastMcpPlanMetadata.plan === "object" && "goal" in lastMcpPlanMetadata.plan ? (lastMcpPlanMetadata.plan as Record<string, unknown>).goal : null,
      lastAction: lastMcpPlanMetadata?.plan && typeof lastMcpPlanMetadata.plan === "object" && "actions" in lastMcpPlanMetadata.plan ? (lastMcpPlanMetadata.plan as Record<string, unknown>).actions : null,
    },
    watchdog: {
      stepLabel: typeof watchdogState?.stepLabel === "string" ? watchdogState.stepLabel : null,
      stepElapsedSeconds: typeof watchdogState?.stepElapsedSeconds === "number" ? watchdogState.stepElapsedSeconds : 0,
      maxStepSeconds: typeof watchdogState?.maxStepSeconds === "number" ? watchdogState.maxStepSeconds : 8,
      noProgressCount: typeof watchdogState?.noProgressCount === "number" ? watchdogState.noProgressCount : 0,
      aiFallbackAttempts: typeof watchdogState?.aiFallbackAttempts === "number" ? watchdogState.aiFallbackAttempts : 0,
      nextAutomaticAction:
        typeof watchdogState?.nextAutomaticAction === "string"
          ? watchdogState.nextAutomaticAction
          : nextRecommendedAction === "safe_continue"
            ? "Autopilot lanjut ke lowongan berikutnya."
            : null,
      lastEvent: latestWatchdogLog?.event ?? null,
      lastMessage: latestWatchdogLog?.message ?? null,
    },
    lastDecisionRequired: parseJson(runtimeCampaign.decisionPayloadJson, null),
    blocker,
    lastSuccessMarker:
      typeof latestSuccessMetadata?.successMarker === "string"
        ? latestSuccessMetadata.successMarker
        : null,
    localLog: {
      file: `storage/logs/campaign-${id}.log`,
      path: `storage/logs/campaign-${id}.log`,
      apiUrl: `/api/campaigns/${id}/local-log?tail=300`,
    },
    mcpUnavailable:
      campaign.status === "paused" && runtimeCampaign.decisionStatus === "mcp_unavailable"
        ? {
            title: "Playwright MCP belum aktif",
            body: "Mode MCP AI First membutuhkan MCP sidecar. Jalankan command berikut di terminal project:",
            command: "npm run mcp:playwright",
            technicalDetails:
              typeof latestMcpFailureMetadata?.error === "string"
                ? latestMcpFailureMetadata.error
                : null,
          }
        : null,
    latestLogs: campaign.logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      level: log.level,
      event: log.event,
      message: log.message,
      readableMessage: translateEvent(log.event),
      jobTitle: log.jobListing?.title ?? null,
    })),
    canContinue:
      !isTerminalStep &&
      campaign.status !== "completed" &&
      (canContinueAutopilot(campaign.status) || canStartAutopilot(campaign.status)),
    nextRecommendedAction,
  });
}
