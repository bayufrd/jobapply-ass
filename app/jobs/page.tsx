import { AppShell } from "@/components/app-shell";
import { getJobsData } from "@/lib/dashboard/data";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string) {
  switch (status) {
    case "discovered":
      return "Ditemukan";
    case "shortlisted":
      return "Shortlist";
    case "skipped":
      return "Dilewati";
    case "applying":
      return "Sedang melamar";
    case "submitted":
      return "Lamaran terkirim";
    case "failed":
      return "Gagal";
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "discovered":
      return "text-cyan-300";
    case "shortlisted":
      return "text-emerald-300";
    case "skipped":
      return "text-slate-400";
    case "applying":
      return "text-amber-300";
    case "submitted":
      return "text-green-300";
    case "failed":
      return "text-rose-300";
    default:
      return "text-slate-300";
  }
}

export default async function JobsPage() {
  const jobs = await getJobsData();

  return (
    <AppShell
      title="Lowongan"
      description="Tinjau lowongan yang ditemukan dari Jobstreet, detail yang terlihat, skor AI, dan alasan sebuah lowongan dipilih atau dilewati."
    >
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center">
            <p className="text-slate-400">
              Belum ada lowongan tersimpan. Jalankan kampanye untuk mulai mencari lowongan.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-[1.3fr_1fr_120px_140px_120px] md:items-center"
              >
                <div>
                  <p className="font-medium text-white">{job.title}</p>
                  <p className="text-sm text-slate-400">{job.company}</p>
                  {job.location && (
                    <p className="mt-1 text-xs text-slate-500">{job.location}</p>
                  )}
                </div>
                <div className="text-sm text-slate-300">
                  {job.salaryText && (
                    <p className="text-emerald-300">{job.salaryText}</p>
                  )}
                  {job.workType && (
                    <p className="mt-1 text-xs text-slate-400">{job.workType}</p>
                  )}
                  {job.snippet && !job.salaryText && !job.workType && (
                    <p className="line-clamp-2 text-xs text-slate-400">{job.snippet}</p>
                  )}
                </div>
                <div>
                  {job.matchScore !== null ? (
                    <p className="text-sm text-cyan-300">Skor {job.matchScore}</p>
                  ) : (
                    <p className="text-xs text-slate-500">Belum dinilai</p>
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${statusColor(job.status)}`}>
                    {statusLabel(job.status)}
                  </p>
                  {job.campaign && (
                    <p className="mt-1 text-xs text-slate-500">
                      Kampanye: {job.campaign.name}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                  >
                    Buka Jobstreet
                  </a>
                  <p className="text-xs text-slate-500">{formatDate(job.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
