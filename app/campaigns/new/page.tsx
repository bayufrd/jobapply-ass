import { AppShell } from "@/components/app-shell";

const defaults = [
  ["Expected salary", "6000000"],
  ["Current salary", "6000000"],
  ["Notice period", "ASAP"],
  ["Availability", "Immediate"],
  ["Submit mode", "assisted_auto_apply"],
];

export default function NewCampaignPage() {
  return (
    <AppShell
      title="New Campaign"
      description="Define job keyword, location, target count, salary defaults, work mode preference, and match threshold before starting browser automation."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Campaign Form Blueprint</h3>
          <div className="mt-4 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
            {['Campaign name','Job keyword','Location','Target apply count','Match threshold','Work mode preference'].map((field) => (
              <div key={field} className="rounded-xl border border-slate-800 bg-slate-950 p-4">{field}</div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Defaults</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {defaults.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <span>{label}</span>
                <span className="text-cyan-300">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
