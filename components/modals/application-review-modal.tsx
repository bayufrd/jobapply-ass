type ApplicationReviewModalProps = {
  title: string;
  company: string;
  score: string;
  summary: string;
  reasoning: string;
};

export function ApplicationReviewModal({ title, company, score, summary, reasoning }: ApplicationReviewModalProps) {
  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-slate-950 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Application Review Modal</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{company}</p>
      <p className="mt-4 text-sm text-slate-300">Match score: {score}</p>
      <p className="mt-2 text-sm text-slate-300">Filled answers summary: {summary}</p>
      <p className="mt-2 text-sm text-slate-400">AI reasoning summary: {reasoning}</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button className="rounded-xl bg-cyan-400 px-4 py-2 font-medium text-slate-950">Approve Submit</button>
        <button className="rounded-xl border border-slate-700 px-4 py-2 text-white">Edit Manually</button>
        <button className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-rose-200">Skip</button>
      </div>
    </div>
  );
}
