import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { campaignCards } from "@/lib/dashboard/mock-data";

export default function CampaignsPage() {
  return (
    <AppShell
      title="Campaigns"
      description="Create, monitor, pause, resume, and stop controlled application campaigns with visible browser oversight."
      actions={<Link href="/campaigns/new" className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300">New Campaign</Link>}
    >
      <div className="grid gap-4">
        {campaignCards.map((campaign) => (
          <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-cyan-500/40 hover:bg-slate-900/80">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">{campaign.name}</h3>
                <p className="mt-2 text-sm text-slate-400">Current job: {campaign.job}</p>
              </div>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-cyan-300">{campaign.status}</span>
            </div>
            <p className="mt-4 text-sm text-slate-300">Progress: {campaign.progress}</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
