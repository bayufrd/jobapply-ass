type QuestionModalProps = {
  question: string;
  suggestedAnswer: string;
  confidence: string;
  evidence: string;
};

export function QuestionModal({ question, suggestedAnswer, confidence, evidence }: QuestionModalProps) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-slate-950 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Pertanyaan Tambahan</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{question}</h3>
      <p className="mt-4 text-sm text-slate-300">Jawaban Saran AI: {suggestedAnswer}</p>
      <p className="mt-2 text-sm text-slate-400">Tingkat Keyakinan: {confidence}</p>
      <p className="mt-2 text-sm text-slate-400">Bukti dari CV: {evidence}</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button className="rounded-xl bg-cyan-400 px-4 py-2 font-medium text-slate-950">Gunakan Jawaban</button>
        <button className="rounded-xl border border-slate-700 px-4 py-2 text-white">Edit Jawaban</button>
        <button className="rounded-xl border border-slate-700 px-4 py-2 text-white">Tolak Jawaban</button>
        <button className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-rose-200">Lewati Lowongan</button>
        <button className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-100">Jeda Kampanye</button>
      </div>
    </div>
  );
}
