import { AppShell } from "@/components/app-shell";

export default function ProfilePage() {
  return (
    <AppShell
      title="Candidate Profile"
      description="Review and edit structured profile fields extracted from the uploaded CV before running any campaign."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Profile Snapshot</h3>
          <div className="mt-4 grid gap-4 text-sm text-slate-300">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">Full name, email, phone, location, and summary will appear here after CV analysis.</div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">Skills, work experience, education, projects, and certifications remain editable before automation.</div>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Safety Notes</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li className="rounded-xl border border-slate-800 bg-slate-950 p-4">Only user-reviewed profile data should be used for assisted auto apply.</li>
            <li className="rounded-xl border border-slate-800 bg-slate-950 p-4">Personal or unclear fields must trigger human review before continuing.</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
