import { AppShell } from "@/components/app-shell";

const applications = [
  ["PT Arunika", "Senior Backend Engineer", "Menunggu Persetujuan", "Menunggu persetujuan kirim dari user"],
  ["Garuda Labs", "Remote Node.js Developer", "Terkirim", "Dikirim setelah disetujui user"],
  ["Nusantara Cloud", "Platform Engineer", "Dilewati", "Gaji tidak sesuai"],
];

export default function ApplicationsPage() {
  return (
    <AppShell
      title="Riwayat Lamaran"
      description="Tinjau setiap percobaan lamaran, termasuk lowongan yang dilewati, review tertunda, lamaran terkirim, dan catatan tangkapan layar."
    >
      <div className="grid gap-4">
        {applications.map(([company, role, status, note]) => (
          <div key={`${company}-${role}`} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{role}</h3>
                <p className="text-sm text-slate-400">{company}</p>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">{status}</span>
            </div>
            <p className="mt-4 text-sm text-slate-300">{note}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
