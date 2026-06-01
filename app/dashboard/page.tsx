import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { campaignCards, dashboardStats, latestLogs, pendingActions } from "@/lib/dashboard/mock-data";

export default function DashboardPage() {
  return (
    <AppShell
      title="Dashboard"
      description="Track live campaigns, pending human decisions, recent automation logs, and the current assisted auto apply status."
      actions={
        <>
          <Link
            href="/cv/upload"
            className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
          >
            Upload CV
          </Link>
          <Link
            href="/campaigns/new"
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            New Campaign
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboardStats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold">Campaign Overview</h3>
            <div className="mt-4 grid gap-4">
              {campaignCards.map((campaign) => (
                <div key={campaign.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-medium">{campaign.name}</p>
                      <p className="text-sm text-slate-400">Current job: {campaign.job}</p>
                    </div>
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-cyan-300">
                      {campaign.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">Progress: {campaign.progress}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-lg font-semibold">Pending User Actions</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {pendingActions.map((item) => (
                  <li key={item} className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-amber-100">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-lg font-semibold">Latest Logs</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {latestLogs.map((log) => (
                  <li key={log} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                    {log}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
