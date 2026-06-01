"use client";

import Link from "next/link";
import { useState } from "react";

type ApplicationStatusCount = {
  shortlisted: number;
  pendingReview: number;
  submitted: number;
  failed: number;
  paused: number;
  skipped: number;
};

type Props = {
  campaignId: string;
  campaignStatus: string;
  appliedCount: number;
  targetApplyCount: number;
  statusCounts: ApplicationStatusCount;
};

export function CampaignActions({
  campaignId,
  campaignStatus,
  appliedCount,
  targetApplyCount,
  statusCounts,
}: Props) {
  const [loopLoading, setLoopLoading] = useState(false);
  const [loopResult, setLoopResult] = useState<string | null>(null);
  const [loopStatus, setLoopStatus] = useState<string | null>(null);

  async function handleLoop() {
    setLoopLoading(true);
    setLoopResult(null);
    setLoopStatus(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/loop`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setLoopResult(data.error || "Gagal menjalankan loop.");
        setLoopStatus("error");
      } else {
        setLoopResult(data.message);
        setLoopStatus(data.status);
      }
    } catch (err) {
      setLoopResult(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setLoopStatus("error");
    } finally {
      setLoopLoading(false);
    }
  }

  async function handleCampaignAction(action: string) {
    try {
      await fetch(`/api/campaigns/${campaignId}/${action}`, { method: "POST" });
      window.location.reload();
    } catch {
      // Ignore
    }
  }

  const isActive = campaignStatus === "running" || campaignStatus === "paused";
  const targetReached = appliedCount >= targetApplyCount;

  return (
    <div className="space-y-6">
      {/* Application Status Stats */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold">Status Lamaran</h3>
        <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Shortlisted</p>
            <p className="mt-2 text-2xl font-bold text-cyan-300">{statusCounts.shortlisted}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Menunggu Review</p>
            <p className="mt-2 text-2xl font-bold text-amber-300">{statusCounts.pendingReview}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Terkirim</p>
            <p className="mt-2 text-2xl font-bold text-emerald-300">{statusCounts.submitted}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Gagal</p>
            <p className="mt-2 text-2xl font-bold text-rose-300">{statusCounts.failed}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Dijeda</p>
            <p className="mt-2 text-2xl font-bold text-cyan-300">{statusCounts.paused}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-slate-400">Dilewati</p>
            <p className="mt-2 text-2xl font-bold text-slate-400">{statusCounts.skipped}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Progres Lamaran</span>
            <span>{appliedCount} / {targetApplyCount} target</span>
          </div>
          <div className="mt-2 h-3 w-full rounded-full bg-slate-800">
            <div
              className={`h-3 rounded-full transition-all ${
                targetReached ? "bg-emerald-500" : "bg-cyan-500"
              }`}
              style={{ width: `${Math.min(100, (appliedCount / targetApplyCount) * 100)}%` }}
            />
          </div>
        </div>
      </section>

      {/* Loop Controls */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold">Kontrol Kampanye</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={handleLoop}
            disabled={loopLoading || !isActive || targetReached}
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              !isActive || targetReached
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
            }`}
            title={
              !isActive
                ? "Kampanye tidak aktif"
                : targetReached
                  ? "Target sudah tercapai"
                  : "Siapkan lamaran berikutnya untuk review"
            }
          >
            {loopLoading ? "Menyiapkan..." : "Siapkan Lamaran Berikutnya"}
          </button>

          <button
            onClick={() => handleCampaignAction("pause")}
            disabled={campaignStatus !== "running"}
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              campaignStatus === "running"
                ? "border-slate-700 text-white hover:bg-slate-800"
                : "border-slate-700 text-slate-500 cursor-not-allowed"
            }`}
          >
            Jeda Kampanye
          </button>

          <button
            onClick={() => handleCampaignAction("resume")}
            disabled={campaignStatus !== "paused"}
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              campaignStatus === "paused"
                ? "border-slate-700 text-white hover:bg-slate-800"
                : "border-slate-700 text-slate-500 cursor-not-allowed"
            }`}
          >
            Lanjutkan Kampanye
          </button>

          <button
            onClick={() => handleCampaignAction("stop")}
            disabled={campaignStatus !== "running" && campaignStatus !== "paused"}
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              isActive
                ? "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                : "border-slate-700 text-slate-500 cursor-not-allowed"
            }`}
          >
            Hentikan Kampanye
          </button>
        </div>

        {/* Loop result */}
        {loopResult && (
          <div
            className={`mt-4 rounded-xl border p-4 text-sm ${
              loopStatus === "completed" || loopStatus === "target_reached"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : loopStatus === "no_jobs"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            {loopResult}
            {loopStatus === "completed" && (
              <span className="mt-2 block text-xs text-emerald-300/70">
                Buka halaman review lamaran untuk menyetujui dan mengirim.
              </span>
            )}
          </div>
        )}

        {/* Pending review links */}
        {statusCounts.pendingReview > 0 && (
          <div className="mt-4">
            <Link
              href="/applications"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20"
            >
              📋 {statusCounts.pendingReview} lamaran menunggu review →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
