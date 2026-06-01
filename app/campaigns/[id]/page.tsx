import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCampaignDetailData } from "@/lib/dashboard/data";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function runCampaignAction(formData: FormData) {
  "use server";

  const campaignId = String(formData.get("campaignId") || "");
  const action = String(formData.get("action") || "");

  if (!campaignId || !action) {
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

  await fetch(`${baseUrl}/api/campaigns/${campaignId}/${action}`, {
    method: "POST",
    cache: "no-store",
  });
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaignDetailData(id);

  if (!campaign) {
    notFound();
  }

  return (
    <AppShell
      title={campaign.name}
      description="Detail kampanye nyata dari database lokal, termasuk progres, riwayat lamaran, dan log otomatisasi terbaru."
      actions={
        <div className="flex flex-wrap gap-3">
          <form action={runCampaignAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="action" value="start" />
            <button className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950">
              Mulai
            </button>
          </form>
          <form action={runCampaignAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="action" value="pause" />
            <button className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-white">
              Jeda
            </button>
          </form>
          <form action={runCampaignAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="action" value="resume" />
            <button className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-white">
              Lanjutkan
            </button>
          </form>
          <form action={runCampaignAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="action" value="stop" />
            <button className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-200">
              Hentikan
            </button>
          </form>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Ringkasan Kampanye</h3>
          <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Status</p>
              <p className="mt-2 text-white">{campaign.status}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Progress</p>
              <p className="mt-2 text-white">{campaign.appliedCount}/{campaign.targetApplyCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Kata kunci</p>
              <p className="mt-2 text-white">{campaign.keyword}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-slate-400">Lokasi</p>
              <p className="mt-2 text-white">{campaign.location || "Semua lokasi"}</p>
            </div>
          </div>

          <h3 className="mt-6 text-lg font-semibold">Riwayat Lamaran</h3>
          <div className="mt-4 space-y-3">
            {campaign.applications.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                Belum ada lamaran tersimpan untuk kampanye ini.
              </div>
            ) : (
              campaign.applications.map((application) => (
                <div key={application.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
                  <p className="font-medium text-white">
                    {application.jobListing.title} · {application.jobListing.company}
                  </p>
                  <p className="mt-2">Status: {application.status}</p>
                  <p className="text-xs text-slate-500">Dibuat {formatDate(application.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold">Status Integrasi</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                Browser visible Playwright: siap diuji
              </li>
              <li className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                Pencarian Jobstreet: Belum diimplementasikan
              </li>
              <li className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                Final submit: Sengaja diblokir
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
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
                  <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                      <span>{log.level}</span>
                      <span>•</span>
                      <span>{log.event}</span>
                    </div>
                    <p className="mt-2 text-slate-200">{log.message}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {log.jobListing ? `Lowongan: ${log.jobListing.title} · ` : ""}
                      {formatDate(log.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
