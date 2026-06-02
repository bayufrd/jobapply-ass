import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/db/prisma";

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function QuestionMemoryPage() {
  const memories = await prisma.questionMemory.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return (
    <AppShell
      title="Memori Pertanyaan"
      description="Gunakan kembali jawaban yang sudah dikonfirmasi untuk pertanyaan lamaran yang berulang sambil tetap mempertahankan review user untuk pertanyaan ambigu atau sensitif."
    >
      {memories.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-slate-400">Belum ada memori pertanyaan.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {memories.map((memory) => (
            <div key={memory.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <p className="font-medium text-white">{memory.questionRaw}</p>
              <div className="mt-4 space-y-2 text-sm text-slate-300">
                <p>
                  <span className="text-slate-400">Jawaban:</span> {memory.answer}
                </p>
                <p>
                  <span className="text-slate-400">Confidence:</span>{" "}
                  <span className="text-cyan-300">{(memory.confidence * 100).toFixed(0)}%</span>
                </p>
                <p>
                  <span className="text-slate-400">Sumber:</span> {memory.source}
                </p>
                <p>
                  <span className="text-slate-400">Digunakan:</span> {memory.usageCount} kali
                </p>
                <p className="text-xs text-slate-500">
                  Diperbarui: {formatDate(memory.updatedAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
