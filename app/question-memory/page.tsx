import { AppShell } from "@/components/app-shell";
import { questionQueue } from "@/lib/dashboard/mock-data";

export default function QuestionMemoryPage() {
  return (
    <AppShell
      title="Question Memory"
      description="Reuse confirmed answers for recurring application questions while keeping human review for ambiguous or sensitive prompts."
    >
      <div className="grid gap-4">
        {questionQueue.map((item) => (
          <div key={item.question} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="font-medium text-white">{item.question}</p>
            <p className="mt-3 text-sm text-slate-300">Suggested answer: {item.suggestion}</p>
            <p className="mt-2 text-sm text-slate-400">Evidence: {item.evidence}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
