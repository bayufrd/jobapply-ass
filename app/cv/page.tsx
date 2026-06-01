import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getCvData } from "@/lib/dashboard/data";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function CvPage() {
  const { uploadedCvs, latestCandidateProfile, latestUploadedCv } = await getCvData();

  return (
    <AppShell
      title="CV"
      description="Kelola file CV yang benar-benar tersimpan di storage lokal, cek hasil ekstraksi teks, lalu lanjutkan ke analisis profil AI."
      actions={
        <Link
          href="/cv/upload"
          className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
        >
          Unggah CV
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold">Riwayat CV Tersimpan</h3>
            <span className="text-sm text-slate-400">Total: {uploadedCvs.length}</span>
          </div>

          <div className="mt-4 space-y-3">
            {uploadedCvs.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                Belum ada CV yang diunggah.
              </div>
            ) : (
              uploadedCvs.map((cv) => (
                <div key={cv.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{cv.fileName}</p>
                      <p className="text-xs text-slate-500">
                        {cv.fileType || "Tipe tidak diketahui"} · {formatDate(cv.createdAt)}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                      {cv.extractedText ? "Teks tersedia" : "Ekstraksi gagal"}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-slate-300">
                    {cv.extractedText?.slice(0, 400) || "Tidak ada teks hasil ekstraksi."}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Status Analisis</h3>
          <div className="mt-4 space-y-4 text-sm text-slate-300">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="font-medium text-white">CV terbaru</p>
              <p className="mt-2 text-slate-300">
                {latestUploadedCv ? latestUploadedCv.fileName : "Belum ada CV terbaru."}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="font-medium text-white">Profil kandidat terbaru</p>
              <p className="mt-2 text-slate-300">
                {latestCandidateProfile?.fullName || "Belum ada hasil analisis tersimpan."}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {latestCandidateProfile
                  ? `Diperbarui ${formatDate(latestCandidateProfile.updatedAt)}`
                  : "Menunggu integrasi analisis CV."}
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100">
              Analisis terbaru harus dijalankan secara eksplisit dari halaman unggah CV agar hasil yang tersimpan jujur dan mudah diverifikasi.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/cv/upload"
                className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              >
                Buka Halaman Unggah
              </Link>
              <Link
                href="/profile"
                className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Lihat Profil Kandidat
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
