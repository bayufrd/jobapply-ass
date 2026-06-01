import { AppShell } from "@/components/app-shell";
import { questionQueue } from "@/lib/dashboard/mock-data";

export default function QuestionMemoryPage() {
  return (
    <AppShell
      title="Memori Pertanyaan"
      description="Gunakan kembali jawaban yang sudah dikonfirmasi untuk pertanyaan lamaran yang berulang sambil tetap mempertahankan review user untuk pertanyaan ambigu atau sensitif."
    >
      <div className="grid gap-4">
        {questionQueue.map((item) => (
          <div key={item.question} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="font-medium text-white">{item.question}</p>
            <p className="mt-3 text-sm text-slate-300">Jawaban Saran AI: {item.suggestion}</p>
            <p className="mt-2 text-sm text-slate-400">Bukti dari CV: {item.evidence}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
