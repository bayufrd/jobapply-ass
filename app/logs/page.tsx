import { AppShell } from "@/components/app-shell";
import { getLogsData } from "@/lib/dashboard/data";

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function LogsPage() {
  const logs = await getLogsData();

  return (
    <AppShell
      title="Log Aktivitas"
      description="Tinjau log otomatisasi nyata dari database lokal, diurutkan dari yang terbaru."
    >
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="space-y-3 text-sm text-slate-300">
          {logs.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-400">
              Belum ada log otomatisasi di database.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 break-all text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span>{log.level}</span>
                  <span>•</span>
                  <span>{log.event}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words break-all text-sm text-slate-200">{log.message}</p>
                <div className="mt-2 space-y-1 break-all text-xs text-slate-500">
                  <p>{formatDate(log.createdAt)}</p>
                  <p>Kampanye: {log.campaign?.name || "Tidak ada"}</p>
                  <p>Lowongan: {log.jobListing?.title || "Tidak ada"}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
