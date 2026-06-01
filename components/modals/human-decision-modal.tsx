type HumanDecisionModalProps = {
  issue: string;
  recommendation: string;
  context: string;
};

export function HumanDecisionModal({ issue, recommendation, context }: HumanDecisionModalProps) {
  return (
    <div className="rounded-2xl border border-sky-500/30 bg-slate-950 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Butuh Keputusan User</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{issue}</h3>
      <p className="mt-4 text-sm text-slate-300">Rekomendasi AI: {recommendation}</p>
      <p className="mt-2 text-sm text-slate-400">Konteks: {context}</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button className="rounded-xl bg-cyan-400 px-4 py-2 font-medium text-slate-950">Setujui</button>
        <button className="rounded-xl border border-slate-700 px-4 py-2 text-white">Tolak</button>
        <button className="rounded-xl border border-slate-700 px-4 py-2 text-white">Edit</button>
        <button className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-rose-200">Lewati</button>
        <button className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-100">Jeda Kampanye</button>
      </div>
    </div>
  );
}
