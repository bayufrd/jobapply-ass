export function CaptchaModal() {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-slate-950 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-rose-300">Verifikasi Diperlukan</p>
      <h3 className="mt-2 text-lg font-semibold text-white">Verifikasi Diperlukan</h3>
      <p className="mt-4 text-sm text-slate-300">
        Sistem mendeteksi captcha atau verifikasi keamanan. Silakan selesaikan secara manual di browser, lalu klik lanjutkan.
      </p>
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        Placeholder tangkapan layar atau pratinjau browser langsung.
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button className="rounded-xl bg-cyan-400 px-4 py-2 font-medium text-slate-950">Lanjutkan Setelah Selesai</button>
        <button className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-100">Jeda Kampanye</button>
      </div>
    </div>
  );
}
