import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { CampaignActions } from "@/components/campaign-actions";
import { getCampaignDetailData, getJobsCountForCampaign } from "@/lib/dashboard/data";

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function statusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Draft";
    case "ready":
      return "Siap";
    case "running":
      return "Berjalan";
    case "paused":
      return "Dijeda";
    case "stopped":
      return "Dihentikan";
    case "completed":
      return "Selesai";
    case "error":
      return "Gagal";
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "running":
      return "text-amber-300";
    case "completed":
      return "text-emerald-300";
    case "error":
      return "text-rose-300";
    case "paused":
      return "text-slate-400";
    case "stopped":
      return "text-rose-300";
    default:
      return "text-white";
  }
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, jobsCount] = await Promise.all([
    getCampaignDetailData(id),
    getJobsCountForCampaign(id),
  ]);

  if (!campaign) {
    notFound();
  }

  // Compute application status counts
  const statusCounts = {
    shortlisted: 0,
    pendingReview: 0,
    submitted: 0,
    failed: 0,
    paused: 0,
    skipped: 0,
  };

  for (const app of campaign.applications) {
    switch (app.status) {
      case "pending_review":
        statusCounts.pendingReview++;
        break;
      case "submitted":
        statusCounts.submitted++;
        break;
      case "failed":
        statusCounts.failed++;
        break;
      case "paused":
        statusCounts.paused++;
        break;
      case "skipped":
        statusCounts.skipped++;
        break;
    }
  }

  // Get the latest search-related log for status message
  const latestSearchLog = campaign.logs.find(
    (log) =>
      log.event === "jobstreet.search_completed" ||
      log.event === "jobstreet.search_failed" ||
      log.event === "jobstreet.search_manual_intervention",
  );

  return (
    <AppShell
      title={campaign.name}
      description="Detail kampanye dari database lokal, termasuk progres pencarian, lowongan ditemukan, dan log otomatisasi terbaru."
    >
      <AutoRefresh enabled={campaign.status === "running" || campaign.status === "paused"} intervalMs={5000} />
      {/* Status message after search */}
      {latestSearchLog && (
        <div
          className={`mb-6 rounded-xl border p-4 text-sm ${
            latestSearchLog.event === "jobstreet.search_completed"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : latestSearchLog.event === "jobstreet.search_failed"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          {latestSearchLog.message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Ringkasan Kampanye</h3>
          <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Status</p>
              <p className={`mt-2 font-medium ${statusColor(campaign.status)}`}>
                {statusLabel(campaign.status)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Lowongan Ditemukan</p>
              <p className="mt-2 text-2xl font-bold text-cyan-300">{jobsCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Kata Kunci</p>
              <p className="mt-2 text-white">{campaign.keyword}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Lokasi</p>
              <p className="mt-2 text-white">{campaign.location || "Semua lokasi"}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Target Lamaran</p>
              <p className="mt-2 text-white">{campaign.targetApplyCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Batas Skor Match</p>
              <p className="mt-2 text-white">{campaign.matchThreshold}%</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Mode</p>
              <p className="mt-2 text-white">
                {campaign.automationMode === "auto_submit_safe_only" ? "Auto Submit Aman" : "Review Setiap Lamaran"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {campaign.automationMode === "auto_submit_safe_only"
                  ? "Sistem akan submit otomatis hanya jika aman."
                  : "Sistem berhenti sebelum submit untuk dicek manual."}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Skor Rendah</p>
              <p className="mt-2 text-white">
                {campaign.lowScoreMode === "auto_skip"
                  ? "Lewati otomatis"
                  : campaign.lowScoreMode === "auto_apply"
                    ? "Tetap lamar otomatis"
                    : "Tanya saya dulu"}
              </p>
            </div>
          </div>

          {jobsCount > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/jobs"
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20"
              >
                Lihat semua lowongan ({jobsCount})
              </Link>
              <Link
                href="/applications"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20"
              >
                Lihat semua lamaran
              </Link>
            </div>
          )}

          {/* Applications List */}
          <h3 className="mt-6 text-lg font-semibold">Riwayat Lamaran</h3>
          <div className="mt-4 space-y-3">
            {campaign.applications.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                Belum ada lamaran tersimpan untuk kampanye ini.
              </div>
            ) : (
              campaign.applications.map((application) => (
                <div key={application.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">
                        {application.jobListing.title} · {application.jobListing.company}
                      </p>
                      <p className="mt-1">
                        Status:{" "}
                        <span
                          className={
                            application.status === "submitted"
                              ? "text-emerald-300"
                              : application.status === "pending_review"
                                ? "text-amber-300"
                                : application.status === "failed"
                                  ? "text-rose-300"
                                  : application.status === "paused"
                                    ? "text-cyan-300"
                                    : "text-slate-400"
                          }
                        >
                          {application.status === "pending_review"
                            ? "Menunggu Review"
                            : application.status === "submitted"
                              ? "Terkirim"
                              : application.status === "failed"
                                ? "Gagal"
                                : application.status === "paused"
                                  ? "Dijeda"
                                  : application.status === "skipped"
                                    ? "Dilewati"
                                    : application.status}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">Dibuat {formatDate(application.createdAt)}</p>
                    </div>
                    {(application.status === "pending_review" || application.status === "paused") && (
                      <Link
                        href={`/applications/${application.id}/review`}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                      >
                        Review →
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <CampaignActions
          campaignId={campaign.id}
          campaignStatus={campaign.status}
          appliedCount={campaign.appliedCount}
          targetApplyCount={campaign.targetApplyCount}
          statusCounts={statusCounts}
        />
      </div>

      {/* Logs section */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Log Aktivitas</h3>
          <Link href="/logs" className="text-sm text-cyan-300 hover:text-cyan-200">
            Buka semua log
          </Link>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          {campaign.logs.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-400">
              Belum ada log untuk kampanye ini.
            </div>
          ) : (
            campaign.logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 break-all text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span
                    className={
                      log.level === "error"
                        ? "text-rose-400"
                        : log.level === "warn"
                          ? "text-amber-400"
                          : "text-slate-400"
                    }
                  >
                    {log.level}
                  </span>
                  <span>•</span>
                  <span>{log.event}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words break-all text-slate-200">{log.message}</p>
                <p className="mt-2 break-all text-xs text-slate-500">
                  {log.jobListing ? `Lowongan: ${log.jobListing.title} · ` : ""}
                  {formatDate(log.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
