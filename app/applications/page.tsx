import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/db/prisma";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string) {
  switch (status) {
    case "pending_review":
      return "Menunggu Review";
    case "approved":
      return "Disetujui";
    case "skipped":
      return "Dilewati";
    case "submitted":
      return "Terkirim";
    case "failed":
      return "Gagal";
    case "paused":
      return "Dijeda";
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "pending_review":
      return "text-amber-300 border-amber-500/30 bg-amber-500/10";
    case "approved":
      return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
    case "skipped":
      return "text-slate-400 border-slate-700 bg-slate-900";
    case "submitted":
      return "text-green-300 border-green-500/30 bg-green-500/10";
    case "failed":
      return "text-rose-300 border-rose-500/30 bg-rose-500/10";
    case "paused":
      return "text-cyan-300 border-cyan-500/30 bg-cyan-500/10";
    default:
      return "text-slate-300 border-slate-700 bg-slate-900";
  }
}

export default async function ApplicationsPage() {
  const applications = await prisma.application.findMany({
    include: {
      campaign: true,
      jobListing: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell
      title="Riwayat Lamaran"
      description="Tinjau setiap percobaan lamaran, termasuk lowongan yang dilewati, review tertunda, lamaran terkirim, dan catatan tangkapan layar."
    >
      {applications.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-slate-400">
            Belum ada riwayat lamaran. Lamaran akan muncul setelah fitur assisted apply aktif.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {applications.map((application) => (
            <div key={application.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">{application.jobListing.title}</h3>
                  <p className="text-sm text-slate-400">{application.jobListing.company}</p>
                  {application.jobListing.location && (
                    <p className="mt-1 text-xs text-slate-500">{application.jobListing.location}</p>
                  )}
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.25em] ${statusColor(application.status)}`}
                >
                  {statusLabel(application.status)}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-400">Kampanye: {application.campaign.name}</span>
                {application.jobListing.matchScore !== null && (
                  <span className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-300">
                    Skor {application.jobListing.matchScore}
                  </span>
                )}
              </div>

              {application.notes && (
                <p className="mt-3 text-sm text-slate-300">{application.notes}</p>
              )}
              {application.skippedReason && (
                <p className="mt-1 text-sm text-slate-400">Alasan dilewati: {application.skippedReason}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Dibuat: {formatDate(application.createdAt)}</p>
                <div className="flex gap-2">
                  <a
                    href={`/applications/${application.id}/review`}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                  >
                    Review
                  </a>
                  <a
                    href={application.jobListing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                  >
                    Buka Jobstreet
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
