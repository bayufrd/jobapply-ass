import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { getDashboardData } from "@/lib/dashboard/data";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const stats = [
    {
      label: "Total CV",
      value: String(data.totalCvUploaded),
      hint: data.latestUploadedCv
        ? `Terakhir diunggah: ${data.latestUploadedCv.fileName}`
        : "Belum ada CV yang diunggah.",
    },
    {
      label: "Profil Kandidat Terbaru",
      value: data.latestCandidateProfile?.fullName || "Belum ada",
      hint: data.latestCandidateProfile
        ? `Diperbarui ${formatDate(data.latestCandidateProfile.updatedAt)}`
        : "Analisis CV belum dijalankan.",
    },
    {
      label: "Total Kampanye",
      value: String(data.totalCampaigns),
      hint: data.runningCampaign
        ? `Sedang berjalan: ${data.runningCampaign.name}`
        : "Belum ada kampanye yang sedang berjalan.",
    },
    {
      label: "Total Lamaran",
      value: String(data.totalApplications),
      hint: `Total log tercatat: ${data.totalLogs}`,
    },
  ];

  return (
    <AppShell
      title="Dasbor"
      description="Pantau data lokal nyata dari database: CV yang diunggah, profil kandidat terbaru, kampanye, lamaran, dan log otomatisasi terbaru."
      actions={
        <>
          <Link
            href="/cv/upload"
            className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
          >
            Unggah CV
          </Link>
          <Link
            href="/campaigns/new"
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Buat Kampanye
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold">Ringkasan Kampanye</h3>
            <div className="mt-4 grid gap-4">
              {data.latestCampaigns.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
                  Belum ada kampanye. Buat kampanye baru untuk mulai pengujian flow lokal.
                </div>
              ) : (
                data.latestCampaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    href={`/campaigns/${campaign.id}`}
                    className="rounded-2xl border border-slate-800 bg-slate-950 p-4 transition hover:border-cyan-500/40"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-lg font-medium">{campaign.name}</p>
                        <p className="text-sm text-slate-400">
                          Kata kunci: {campaign.keyword}
                          {campaign.location ? ` · ${campaign.location}` : " · Semua lokasi"}
                        </p>
                      </div>
                      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-cyan-300">
                        {campaign.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">
                      Progress target: {campaign.appliedCount}/{campaign.targetApplyCount}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {campaign.logs[0]
                        ? `Log terakhir: ${campaign.logs[0].event} · ${formatDate(campaign.logs[0].createdAt)}`
                        : "Belum ada log kampanye."}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-lg font-semibold">Status Sistem</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                  Profil kandidat: {data.latestCandidateProfile ? "Siap dipakai" : "Menunggu analisis CV"}
                </li>
                <li className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                  Kampanye aktif: {data.runningCampaign ? data.runningCampaign.name : "Tidak ada"}
                </li>
                <li className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                  Pencarian Jobstreet: Aktif
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-lg font-semibold">Log Terbaru</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {data.latestLogs.length === 0 ? (
                  <li className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-400">
                    Belum ada log otomatisasi di database.
                  </li>
                ) : (
                  data.latestLogs.map((log) => (
                    <li key={log.id} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                        <span>{log.level}</span>
                        <span>•</span>
                        <span>{log.event}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-200">{log.message}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {log.campaign ? `Kampanye: ${log.campaign.name} · ` : ""}
                        {log.jobListing ? `Lowongan: ${log.jobListing.title} · ` : ""}
                        {formatDate(log.createdAt)}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
