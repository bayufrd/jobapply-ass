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
      return "text-amber-300";
    case "approved":
      return "text-emerald-300";
    case "skipped":
      return "text-slate-400";
    case "submitted":
      return "text-green-300";
    case "failed":
      return "text-rose-300";
    case "paused":
      return "text-cyan-300";
    default:
      return "text-slate-300";
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{application.jobListing.title}</h3>
                  <p className="text-sm text-slate-400">{application.jobListing.company}</p>
                  {application.jobListing.location && (
                    <p className="mt-1 text-xs text-slate-500">{application.jobListing.location}</p>
                  )}
                </div>
                <span className={`rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.25em] ${statusColor(application.status)}`}>
                  {statusLabel(application.status)}
                </span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-300">
                <p>Kampanye: {application.campaign.name}</p>
                {application.notes && <p>Catatan: {application.notes}</p>}
                {application.skippedReason && <p>Alasan dilewati: {application.skippedReason}</p>}
                {application.submittedAt && (
                  <p>Dikirim: {formatDate(application.submittedAt)}</p>
                )}
                <p className="text-xs text-slate-500">Dibuat: {formatDate(application.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
