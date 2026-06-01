import { AppShell } from "@/components/app-shell";

export default function ProfilePage() {
  return (
    <AppShell
      title="Profil Kandidat"
      description="Tinjau dan edit data profil terstruktur yang diambil dari CV yang diunggah sebelum menjalankan kampanye apa pun."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Ringkasan Profil</h3>
          <div className="mt-4 grid gap-4 text-sm text-slate-300">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">Nama lengkap, email, nomor telepon, lokasi, dan ringkasan akan tampil di sini setelah analisis CV.</div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">Keahlian, pengalaman kerja, pendidikan, proyek, dan sertifikasi tetap bisa diedit sebelum otomasi berjalan.</div>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Catatan Keamanan</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li className="rounded-xl border border-slate-800 bg-slate-950 p-4">Hanya data profil yang sudah ditinjau user yang boleh digunakan untuk auto apply dibantu.</li>
            <li className="rounded-xl border border-slate-800 bg-slate-950 p-4">Data pribadi atau field yang belum jelas harus memicu review user sebelum dilanjutkan.</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
