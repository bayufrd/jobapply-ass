type QuestionModalProps = {
  question: string;
  suggestedAnswer: string;
  confidence: string;
  evidence: string;
};

export function QuestionModal({ question, suggestedAnswer, confidence, evidence }: QuestionModalProps) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-slate-950 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Question Modal</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{question}</h3>
      <p className="mt-4 text-sm text-slate-300">AI suggested answer: {suggestedAnswer}</p>
      <p className="mt-2 text-sm text-slate-400">Confidence: {confidence}</p>
      <p className="mt-2 text-sm text-slate-400">Related CV evidence: {evidence}</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button className="rounded-xl bg-cyan-400 px-4 py-2 font-medium text-slate-950">Use Answer</button>
        <button className="rounded-xl border border-slate-700 px-4 py-2 text-white">Edit Answer</button>
        <button className="rounded-xl border border-slate-700 px-4 py-2 text-white">Reject Answer</button>
        <button className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-rose-200">Skip Job</button>
        <button className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-100">Pause Campaign</button>
      </div>
    </div>
  );
}
