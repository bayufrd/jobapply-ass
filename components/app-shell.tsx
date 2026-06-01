import Link from "next/link";
import { BriefcaseBusiness, FileText, LayoutDashboard, Logs, Settings2, User2, Workflow } from "lucide-react";

const navigation = [
  { href: "/dashboard", label: "Dasbor", icon: LayoutDashboard },
  { href: "/cv/upload", label: "Unggah CV", icon: FileText },
  { href: "/profile", label: "Profil Kandidat", icon: User2 },
  { href: "/campaigns", label: "Kampanye Lamaran", icon: Workflow },
  { href: "/jobs", label: "Lowongan", icon: BriefcaseBusiness },
  { href: "/applications", label: "Riwayat Lamaran", icon: FileText },
  { href: "/logs", label: "Log Aktivitas", icon: Logs },
  { href: "/settings", label: "Pengaturan", icon: Settings2 },
];

type AppShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export function AppShell({ title, description, children, actions }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">MVP Lokal</p>
            <h1 className="mt-2 text-2xl font-semibold">JobApply Assistant</h1>
            <p className="mt-2 text-sm text-slate-400">
              Auto apply dibantu dengan pengawasan user.
            </p>
          </div>

          <nav className="space-y-2">
            {navigation.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur">
          <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Otomasi Terkendali</p>
              <h2 className="mt-2 text-3xl font-semibold">{title}</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">{description}</p>
            </div>
            {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
          </header>

          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
