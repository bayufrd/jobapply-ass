import { AppShell } from "@/components/app-shell";

const defaults = [
  ["Ekspektasi Gaji", "6000000"],
  ["Gaji Saat Ini", "6000000"],
  ["Waktu Mulai Kerja", "ASAP"],
  ["Ketersediaan", "Segera"],
  ["Mode Pengiriman", "Auto Apply dengan Pengawasan User"],
];

export default function NewCampaignPage() {
  return (
    <AppShell
      title="Buat Kampanye"
      description="Tentukan kata kunci lowongan, lokasi, target lamaran, default gaji, preferensi sistem kerja, dan batas minimal kecocokan sebelum memulai otomasi browser."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Rancangan Form Kampanye</h3>
          <div className="mt-4 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
            {['Nama Kampanye','Kata Kunci Lowongan','Lokasi','Target Jumlah Lamaran','Batas Minimal Kecocokan','Preferensi Sistem Kerja'].map((field) => (
              <div key={field} className="rounded-xl border border-slate-800 bg-slate-950 p-4">{field}</div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Nilai Default</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {defaults.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <span>{label}</span>
                <span className="text-cyan-300">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
