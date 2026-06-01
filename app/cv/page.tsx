import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function CvPage() {
  return (
    <AppShell
      title="CV Workspace"
      description="Manage uploaded CV files, extracted text, and the next step for AI profile analysis before any application campaign runs."
      actions={
        <Link
          href="/cv/upload"
          className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
        >
          Upload New CV
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          Uploaded CV files and extraction history will appear here.
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          Trigger CV analysis only after the extracted text looks correct and complete.
        </section>
      </div>
    </AppShell>
  );
}
