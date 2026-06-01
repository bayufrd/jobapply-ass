import { AppShell } from "@/components/app-shell";

const jobs = [
  ["Senior Backend Engineer", "PT Arunika", "84", "Siap direview"],
  ["Platform Engineer", "Nusantara Cloud", "76", "Di bawah batas minimal"],
  ["Remote Node.js Developer", "Garuda Labs", "88", "Draft lamaran siap"],
];

export default function JobsPage() {
  return (
    <AppShell
      title="Lowongan"
      description="Tinjau lowongan yang ditemukan, detail yang terlihat, skor AI, dan alasan sebuah lowongan dipilih atau dilewati."
    >
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="grid gap-4">
          {jobs.map(([title, company, score, status]) => (
            <div key={`${title}-${company}`} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-[1.3fr_1fr_120px_180px] md:items-center">
              <div>
                <p className="font-medium text-white">{title}</p>
                <p className="text-sm text-slate-400">{company}</p>
              </div>
              <p className="text-sm text-slate-300">Hanya detail yang terlihat pada halaman saat ini yang diambil.</p>
              <p className="text-sm text-cyan-300">Skor {score}</p>
              <p className="text-sm text-slate-300">{status}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
