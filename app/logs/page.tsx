import { AppShell } from "@/components/app-shell";
import { latestLogs } from "@/lib/dashboard/mock-data";

export default function LogsPage() {
  return (
    <AppShell
      title="Logs"
      description="Inspect timestamped automation events, browser pauses, captcha detections, AI decisions, and operator actions."
    >
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <ul className="space-y-3 text-sm text-slate-300">
          {latestLogs.map((log, index) => (
            <li key={`${index}-${log}`} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              {log}
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
