import { AppShell } from "@/components/app-shell";
import { latestLogs, pendingActions, questionQueue } from "@/lib/dashboard/mock-data";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AppShell
      title={`Campaign ${id}`}
      description="Review current status, current job, pending approvals, and live log output for a single application campaign."
      actions={
        <>
          <button className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950">Pause</button>
          <button className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-white">Resume</button>
          <button className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-200">Stop</button>
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Current Job Being Processed</h3>
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
            Senior Backend Engineer · PT Arunika · Jakarta · Match Score 84
          </div>
          <h3 className="mt-6 text-lg font-semibold">Automation Logs</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            {latestLogs.map((log) => (
              <li key={log} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">{log}</li>
            ))}
          </ul>
        </section>
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold">Pending Approvals</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {pendingActions.map((item) => (
                <li key={item} className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-amber-100">{item}</li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold">Paused Questions</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {questionQueue.map((item) => (
                <li key={item.question} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <p className="font-medium text-white">{item.question}</p>
                  <p className="mt-2 text-slate-400">Suggestion: {item.suggestion}</p>
                  <p className="mt-1 text-slate-500">Confidence: {item.confidence}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
