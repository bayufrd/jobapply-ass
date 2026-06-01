type HumanDecisionModalProps = {
  issue: string;
  recommendation: string;
  context: string;
};

export function HumanDecisionModal({ issue, recommendation, context }: HumanDecisionModalProps) {
  return (
    <div className="rounded-2xl border border-sky-500/30 bg-slate-950 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Human Decision Modal</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{issue}</h3>
      <p className="mt-4 text-sm text-slate-300">AI recommendation: {recommendation}</p>
      <p className="mt-2 text-sm text-slate-400">Context: {context}</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button className="rounded-xl bg-cyan-400 px-4 py-2 font-medium text-slate-950">Approve</button>
        <button className="rounded-xl border border-slate-700 px-4 py-2 text-white">Reject</button>
        <button className="rounded-xl border border-slate-700 px-4 py-2 text-white">Edit</button>
        <button className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-rose-200">Skip</button>
        <button className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-100">Pause Campaign</button>
      </div>
    </div>
  );
}
