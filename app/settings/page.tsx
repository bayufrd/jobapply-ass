import { AppShell } from "@/components/app-shell";

const settings = [
  "URL dasar 9router dan konfigurasi model",
  "Status sesi browser Jobstreet yang terlihat dan tersimpan",
  "Nilai default gaji, waktu mulai kerja, dan ketersediaan",
  "Kontrol keamanan untuk intervensi manual dan persetujuan pengiriman",
];

export default function SettingsPage() {
  return (
    <AppShell
      title="Pengaturan"
      description="Atur default lingkungan lokal, path sesi browser, endpoint AI, dan batasan keamanan untuk otomasi dengan pengawasan user."
    >
      <div className="grid gap-4">
        {settings.map((item) => (
          <div key={item} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            {item}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
