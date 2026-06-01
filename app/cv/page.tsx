import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function CvPage() {
  return (
    <AppShell
      title="Unggah CV"
      description="Kelola file CV yang diunggah, teks hasil ekstraksi, dan langkah berikutnya untuk analisis profil AI sebelum kampanye lamaran berjalan."
      actions={
        <Link
          href="/cv/upload"
          className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
        >
          Unggah CV
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          File CV yang sudah diunggah dan riwayat ekstraksi akan tampil di sini.
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          Jalankan analisis CV hanya setelah teks hasil ekstraksi terlihat benar dan lengkap.
        </section>
      </div>
    </AppShell>
  );
}
