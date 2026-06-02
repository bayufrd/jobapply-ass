"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ApplicationStatusCount = {
  shortlisted: number;
  pendingReview: number;
  submitted: number;
  failed: number;
  paused: number;
  skipped: number;
};

type CampaignStatusResponse = {
  campaign: {
    id: string;
    status: string;
    appliedCount: number;
    targetApplyCount: number;
    currentStep: string | null;
    currentQuestion: string | null;
    decisionStatus: string | null;
  };
  counts: {
    jobsFound: number;
    jobsAnalyzed: number;
    aiSkipped: number;
    userForcedApply: number;
    applicationsProcessed: number;
    waitingForUserAnswer: number;
    waitingForReviewSubmit: number;
    submitted: number;
    failed: number;
  };
  currentStep: string | null;
  currentJob: {
    id: string;
    title: string;
    company: string;
    matchScore: number | null;
    status: string;
  } | null;
  lastDecisionRequired: {
    type?: string;
    jobId?: string;
    title?: string;
    company?: string;
    score?: number;
    threshold?: number;
    reason?: string;
    applicationId?: string;
    question?: string;
    message?: string;
  } | null;
  latestLogs: Array<{
    id: string;
    createdAt: string;
    level: string;
    event: string;
    message: string;
    readableMessage: string;
    jobTitle: string | null;
  }>;
  canContinue: boolean;
  nextRecommendedAction: string;
};

type Props = {
  campaignId: string;
  campaignStatus: string;
  appliedCount: number;
  targetApplyCount: number;
  statusCounts: ApplicationStatusCount;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function stepLabel(step: string | null | undefined) {
  switch (step) {
    case "searching_jobs":
      return "Sedang mencari lowongan";
    case "scoring_job":
      return "Sedang menilai kecocokan lowongan";
    case "decision_required":
      return "Menunggu keputusan low score";
    case "calibrating_apply_flow":
      return "Sedang kalibrasi alur lamar";
    case "starting_apply":
      return "Sedang memulai proses lamar";
    case "question_required":
      return "Menunggu jawaban Anda";
    case "review_required":
      return "Menunggu review submit";
    case "external_redirect":
      return "Butuh tindakan manual pada lowongan eksternal";
    case "apply_unavailable_skipped":
      return "Lowongan dilewati karena tombol lamar tidak ditemukan";
    case "too_many_unusable_jobs":
      return "Terlalu banyak lowongan tidak bisa dilamar";
    case "manual_intervention":
      return "Butuh tindakan manual";
    case "target_reached":
      return "Target kampanye tercapai";
    case "no_jobs_remaining":
      return "Tidak ada lowongan tersisa";
    case "decision_resolved":
      return "Keputusan diproses, siap lanjut";
    default:
      return step ?? "Belum ada status proses";
  }
}

export function CampaignActions({
  campaignId,
  campaignStatus,
  appliedCount,
  targetApplyCount,
  statusCounts,
}: Props) {
  const [statusData, setStatusData] = useState<CampaignStatusResponse | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultTone, setResultTone] = useState<"success" | "warning" | "error" | null>(null);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/status`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Gagal memuat status kampanye.");
    }
    setStatusData(data);
  }, [campaignId]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      fetchStatus().catch(() => undefined);
    }, 0);
    const interval = window.setInterval(() => {
      fetchStatus().catch(() => undefined);
    }, 3000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [fetchStatus]);

  const effectiveCampaignStatus = statusData?.campaign.status ?? campaignStatus;
  const effectiveAppliedCount = statusData?.campaign.appliedCount ?? appliedCount;
  const effectiveTargetApplyCount = statusData?.campaign.targetApplyCount ?? targetApplyCount;
  const targetReached = effectiveAppliedCount >= effectiveTargetApplyCount;
  const latestDecision = statusData?.lastDecisionRequired;

  const progressWidth = useMemo(() => {
    if (effectiveTargetApplyCount <= 0) return 0;
    return Math.min(100, (effectiveAppliedCount / effectiveTargetApplyCount) * 100);
  }, [effectiveAppliedCount, effectiveTargetApplyCount]);

  async function runSimpleAction(path: string, successFallback: string) {
    setLoadingAction(path);
    setResultMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/${path}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Gagal menjalankan aksi ${path}.`);
      }
      setResultMessage(data.message || successFallback);
      setResultTone("success");
      await fetchStatus();
      window.location.reload();
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : "Terjadi kesalahan.");
      setResultTone("error");
    } finally {
      setLoadingAction(null);
    }
  }

  async function runAutopilot(path: "start" | "continue") {
    setLoadingAction(path);
    setResultMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/autopilot/${path}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Gagal menjalankan autopilot (${path}).`);
      }
      setResultMessage(data.message || "Autopilot diperbarui.");
      setResultTone(
        data.status === "error" ? "error" : data.status === "paused" || data.status === "decision_required" || data.status === "question_required" || data.status === "review_required" ? "warning" : "success",
      );
      await fetchStatus();
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : "Terjadi kesalahan.");
      setResultTone("error");
    } finally {
      setLoadingAction(null);
    }
  }

  async function submitDecision(action: "apply" | "skip" | "skip_similar" | "ask_later") {
    setLoadingAction(action);
    setResultMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/autopilot/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason:
            action === "apply"
              ? "User memilih tetap melamar."
              : action === "skip_similar"
                ? "User memilih selalu melewati kasus serupa di kampanye ini."
                : action === "skip"
                  ? "User memilih melewati lowongan ini."
                  : "User ingin memutuskan nanti.",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memproses keputusan autopilot.");
      }
      setResultMessage(data.message || "Keputusan berhasil disimpan.");
      setResultTone(action === "apply" ? "success" : "warning");
      await fetchStatus();
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : "Terjadi kesalahan.");
      setResultTone("error");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold">Status Autopilot</h3>
        <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Status kampanye</p>
            <p className="mt-2 font-medium text-white">{effectiveCampaignStatus}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Langkah saat ini</p>
            <p className="mt-2 font-medium text-cyan-300">{stepLabel(statusData?.currentStep)}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Lowongan ditemukan</p>
            <p className="mt-2 text-2xl font-bold text-cyan-300">{statusData?.counts.jobsFound ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Lowongan dianalisis</p>
            <p className="mt-2 text-2xl font-bold text-white">{statusData?.counts.jobsAnalyzed ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Lowongan diskip AI</p>
            <p className="mt-2 text-2xl font-bold text-slate-300">{statusData?.counts.aiSkipped ?? statusCounts.skipped}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Diputuskan user tetap dilamar</p>
            <p className="mt-2 text-2xl font-bold text-amber-300">{statusData?.counts.userForcedApply ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Lamaran diproses</p>
            <p className="mt-2 text-2xl font-bold text-white">{statusData?.counts.applicationsProcessed ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Menunggu jawaban user</p>
            <p className="mt-2 text-2xl font-bold text-amber-300">{statusData?.counts.waitingForUserAnswer ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Menunggu review submit</p>
            <p className="mt-2 text-2xl font-bold text-amber-300">{statusData?.counts.waitingForReviewSubmit ?? statusCounts.pendingReview}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Terkirim</p>
            <p className="mt-2 text-2xl font-bold text-emerald-300">{statusData?.counts.submitted ?? statusCounts.submitted}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Gagal</p>
            <p className="mt-2 text-2xl font-bold text-rose-300">{statusData?.counts.failed ?? statusCounts.failed}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Target progress</p>
            <p className="mt-2 text-2xl font-bold text-cyan-300">{effectiveAppliedCount} / {effectiveTargetApplyCount}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Progres target lamaran</span>
            <span>{effectiveAppliedCount} / {effectiveTargetApplyCount}</span>
          </div>
          <div className="mt-2 h-3 w-full rounded-full bg-slate-800">
            <div className={`h-3 rounded-full transition-all ${targetReached ? "bg-emerald-500" : "bg-cyan-500"}`} style={{ width: `${progressWidth}%` }} />
          </div>
        </div>

        {statusData?.currentJob && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
            <p className="text-slate-400">Lowongan saat ini</p>
            <p className="mt-1 font-medium text-white">{statusData.currentJob.title} · {statusData.currentJob.company}</p>
            <p className="mt-1 text-xs text-slate-500">
              Skor: {statusData.currentJob.matchScore ?? "-"} · Status: {statusData.currentJob.status}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold">Kontrol Kampanye</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => runAutopilot("start")}
            disabled={loadingAction !== null || targetReached}
            className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingAction === "start" ? "Menjalankan..." : "Jalankan Kampanye Autopilot"}
          </button>
          <button
            onClick={() => runSimpleAction("pause", "Kampanye dijeda.")}
            disabled={loadingAction !== null || effectiveCampaignStatus !== "running"}
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Jeda
          </button>
          <button
            onClick={() => runAutopilot("continue")}
            disabled={loadingAction !== null || !statusData?.canContinue || targetReached}
            className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingAction === "continue" ? "Melanjutkan..." : "Lanjutkan"}
          </button>
          <button
            onClick={() => runSimpleAction("stop", "Kampanye dihentikan.")}
            disabled={loadingAction !== null || (effectiveCampaignStatus !== "running" && effectiveCampaignStatus !== "paused")}
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hentikan
          </button>
          <Link href="/logs" className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800">
            Buka Log
          </Link>
          <Link href="/jobs" className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20">
            Lihat Lowongan
          </Link>
        </div>

        {resultMessage && (
          <div
            className={`mt-4 rounded-xl border p-4 text-sm ${
              resultTone === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : resultTone === "warning"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            {resultMessage}
          </div>
        )}
      </section>

      {latestDecision?.type === "low_score" && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h3 className="text-lg font-semibold text-amber-300">AI menyarankan lowongan ini dilewati</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p><span className="text-slate-400">Posisi:</span> {latestDecision.title}</p>
            <p><span className="text-slate-400">Perusahaan:</span> {latestDecision.company}</p>
            <p><span className="text-slate-400">Skor:</span> {latestDecision.score ?? "-"}</p>
            <p><span className="text-slate-400">Threshold:</span> {latestDecision.threshold ?? "-"}</p>
            <p><span className="text-slate-400">Alasan AI:</span> {latestDecision.reason ?? "AI menyarankan lowongan ini dilewati."}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => submitDecision("apply")} disabled={loadingAction !== null} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50">Tetap Lamar</button>
            <button onClick={() => submitDecision("skip")} disabled={loadingAction !== null} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50">Lewati</button>
            <button onClick={() => submitDecision("skip_similar")} disabled={loadingAction !== null} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">Selalu Lewati Kasus Serupa di Kampanye Ini</button>
            <button onClick={() => submitDecision("ask_later")} disabled={loadingAction !== null} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50">Tanya Lagi Nanti</button>
          </div>
        </section>
      )}

      {latestDecision?.type === "question_required" && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h3 className="text-lg font-semibold text-amber-300">Pertanyaan memerlukan jawaban Anda</h3>
          <p className="mt-2 text-sm text-slate-300">{latestDecision.question ?? latestDecision.message ?? "Autopilot menunggu jawaban user sebelum melanjutkan."}</p>
          {latestDecision.applicationId && (
            <div className="mt-4">
              <Link href={`/applications/${latestDecision.applicationId}/review`} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20">
                Buka Review untuk Menjawab
              </Link>
            </div>
          )}
        </section>
      )}

      {latestDecision?.type === "review_required" && (
        <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6">
          <h3 className="text-lg font-semibold text-cyan-300">Menunggu review submit</h3>
          <p className="mt-2 text-sm text-slate-300">Lamaran sudah siap direview. Submit hanya dilakukan saat aman dan sesuai mode kampanye.</p>
          {latestDecision.applicationId && (
            <div className="mt-4">
              <Link href={`/applications/${latestDecision.applicationId}/review`} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20">
                Buka Review Submit
              </Link>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Timeline Kampanye</h3>
          <span className="text-xs text-slate-500">Polling 3 detik</span>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          {(statusData?.latestLogs ?? []).length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-400">Belum ada event kampanye terbaru.</div>
          ) : (
            (statusData?.latestLogs ?? []).map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{formatDate(log.createdAt)}</span>
                  <span>•</span>
                  <span className={log.level === "error" ? "text-rose-400" : log.level === "warn" ? "text-amber-400" : "text-slate-500"}>{log.level}</span>
                </div>
                <p className="mt-2 text-slate-200">{log.message || log.readableMessage}</p>
                {log.jobTitle && <p className="mt-1 text-xs text-slate-500">Lowongan: {log.jobTitle}</p>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
