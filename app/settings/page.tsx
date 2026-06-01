import { AppShell } from "@/components/app-shell";

const settings = [
  "9router base URL and model configuration",
  "Saved Jobstreet visible browser session state",
  "Default salary, notice period, and availability values",
  "Safety controls for manual intervention and submit approval",
];

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      description="Configure local environment defaults, browser session paths, AI endpoints, and guardrails for human-in-the-loop automation."
    >
      <div className="grid gap-4">
        {settings.map((item) => (
          <div key={item} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            {item}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
