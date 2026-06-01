import { AppShell } from "@/components/app-shell";
import { getSettingsData } from "@/lib/dashboard/data";

function formatDate(date?: Date | null) {
  if (!date) return "Belum pernah dicek";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function SettingsPage() {
  const { session, userSettings, envDefaults } = await getSettingsData();

  return (
    <AppShell
      title="Pengaturan"
      description="Status runtime lokal untuk 9router, browser session Playwright, dan nilai default yang dipakai kampanye."
    >
      <div className="grid gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          <h3 className="text-lg font-semibold text-white">Status 9router</h3>
          <p className="mt-2">
            {envDefaults.nineRouterConfigured
              ? "Konfigurasi 9router terdeteksi di ENV."
              : "Konfigurasi 9router belum lengkap. Analisis CV akan gagal sampai ENV dilengkapi."}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          <h3 className="text-lg font-semibold text-white">Sesi Browser Jobstreet</h3>
          <div className="mt-3 space-y-2">
            <p>Path sesi: {session?.sessionPath || envDefaults.sessionPath}</p>
            <p>Visible mode: {envDefaults.visibleMode ? "Aktif" : "Tidak aktif"}</p>
            <p>Status session DB: {session ? (session.isValid ? "Valid" : "Tidak valid") : "Belum ada data"}</p>
            <p>Pemeriksaan terakhir: {formatDate(session?.lastCheckedAt)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          <h3 className="text-lg font-semibold text-white">Default Kampanye dari ENV</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">Ekspektasi gaji: {envDefaults.expectedSalary}</div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">Gaji saat ini: {envDefaults.currentSalary}</div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">Notice period: {envDefaults.noticePeriod}</div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">Ketersediaan: {envDefaults.availability}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          <h3 className="text-lg font-semibold text-white">User Setting Tersimpan</h3>
          {userSettings.length === 0 ? (
            <p className="mt-2 text-slate-400">Belum ada user setting tersimpan di database.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {userSettings.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <p className="font-medium text-white">{item.key}</p>
                  <p className="mt-1 text-slate-300">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
