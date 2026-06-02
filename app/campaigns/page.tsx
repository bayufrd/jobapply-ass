import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getCampaignListData } from "@/lib/dashboard/data";

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function CampaignsPage() {
  const campaigns = await getCampaignListData();

  return (
    <AppShell
      title="Kampanye Lamaran"
      description="Daftar kampanye nyata dari database lokal. Pantau status, target, progres, dan log terakhir tanpa data palsu."
      actions={
        <Link
          href="/campaigns/new"
          className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
        >
          Buat Kampanye
        </Link>
      }
    >
      <div className="grid gap-4">
        {campaigns.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            Belum ada kampanye tersimpan. Buat kampanye baru untuk mulai menguji flow lokal.
          </div>
        ) : (
          campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-cyan-500/40 hover:bg-slate-900/80"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold">{campaign.name}</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    Kata kunci: {campaign.keyword}
                    {campaign.location ? ` · ${campaign.location}` : " · Semua lokasi"}
                  </p>
                </div>
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-cyan-300">
                  {campaign.status}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                <p>
                  Progress target: {campaign.appliedCount}/{campaign.targetApplyCount}
                </p>
                <p>Total lamaran: {campaign.applications.length}</p>
                <p>Ambang kecocokan: {campaign.matchThreshold}</p>
                <p>
                  Diperbarui: {formatDate(campaign.updatedAt)}
                </p>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                {campaign.logs[0]
                  ? `Log terakhir: ${campaign.logs[0].event} · ${formatDate(campaign.logs[0].createdAt)}`
                  : "Belum ada log kampanye."}
              </p>
            </Link>
          ))
        )}
      </div>
    </AppShell>
  );
}
