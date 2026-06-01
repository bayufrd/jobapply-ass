import { AppShell } from "@/components/app-shell";

const jobs = [
  ["Senior Backend Engineer", "PT Arunika", "84", "Ready for review"],
  ["Platform Engineer", "Nusantara Cloud", "76", "Below threshold"],
  ["Remote Node.js Developer", "Garuda Labs", "88", "Application draft ready"],
];

export default function JobsPage() {
  return (
    <AppShell
      title="Jobs"
      description="Inspect discovered job listings, visible extracted details, AI scores, and why a job was shortlisted or skipped."
    >
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="grid gap-4">
          {jobs.map(([title, company, score, status]) => (
            <div key={`${title}-${company}`} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-[1.3fr_1fr_120px_180px] md:items-center">
              <div>
                <p className="font-medium text-white">{title}</p>
                <p className="text-sm text-slate-400">{company}</p>
              </div>
              <p className="text-sm text-slate-300">Visible details extracted from current page only.</p>
              <p className="text-sm text-cyan-300">Score {score}</p>
              <p className="text-sm text-slate-300">{status}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
