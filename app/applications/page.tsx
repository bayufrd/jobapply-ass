import { AppShell } from "@/components/app-shell";

const applications = [
  ["PT Arunika", "Senior Backend Engineer", "pending_review", "Waiting for explicit submit approval"],
  ["Garuda Labs", "Remote Node.js Developer", "submitted", "Submitted after user approval"],
  ["Nusantara Cloud", "Platform Engineer", "skipped", "Salary mismatch"],
];

export default function ApplicationsPage() {
  return (
    <AppShell
      title="Applications"
      description="Audit every application attempt, including skipped jobs, pending reviews, submitted records, and screenshot notes."
    >
      <div className="grid gap-4">
        {applications.map(([company, role, status, note]) => (
          <div key={`${company}-${role}`} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{role}</h3>
                <p className="text-sm text-slate-400">{company}</p>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">{status}</span>
            </div>
            <p className="mt-4 text-sm text-slate-300">{note}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
