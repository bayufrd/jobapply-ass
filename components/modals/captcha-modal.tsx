export function CaptchaModal() {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-slate-950 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-rose-300">Captcha Modal</p>
      <h3 className="mt-2 text-lg font-semibold text-white">Captcha detected</h3>
      <p className="mt-4 text-sm text-slate-300">
        Automation is paused. Solve the captcha manually in the visible browser, then continue.
      </p>
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        Screenshot or live browser preview placeholder.
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button className="rounded-xl bg-cyan-400 px-4 py-2 font-medium text-slate-950">Continue After Solved</button>
        <button className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-100">Pause Campaign</button>
      </div>
    </div>
  );
}
