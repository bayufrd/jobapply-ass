import { AppShell } from "@/components/app-shell";
import { getProfileData } from "@/lib/dashboard/data";
import { parseProfileJson } from "@/lib/profile/parse-profile-json";
import { renderFlexibleObject } from "@/lib/profile/humanize";
import Link from "next/link";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function ProfilePage() {
  const { latestCandidateProfile, latestUploadedCv } = await getProfileData();

  if (!latestCandidateProfile) {
    return (
      <AppShell
        title="Profil Kandidat"
        description="Tinjau hasil analisis CV terbaru yang benar-benar tersimpan di database sebelum kampanye dijalankan."
      >
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          <p className="font-medium text-white">Belum ada profil kandidat.</p>
          <p className="mt-2">
            Unggah CV lalu jalankan analisis agar profil kandidat tersimpan di database.
          </p>
          <div className="mt-6">
            <Link
              href="/cv/upload"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Unggah & Analisis CV
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const skills = parseProfileJson(latestCandidateProfile.skillsJson);
  const experiences = parseProfileJson(latestCandidateProfile.experienceJson);
  const education = parseProfileJson(latestCandidateProfile.educationJson);
  const projects = parseProfileJson(latestCandidateProfile.projectsJson);
  const certifications = parseProfileJson(latestCandidateProfile.certificationsJson);

  return (
    <AppShell
      title="Profil Kandidat"
      description="Tinjau hasil analisis CV terbaru yang benar-benar tersimpan di database sebelum kampanye dijalankan."
    >
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Detail Profil</h2>
        <Link
          href="/cv/upload"
          className="text-sm font-medium text-blue-400 hover:text-blue-300"
        >
          Analisis Ulang CV
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Identity & Summary */}
        <div className="space-y-6 lg:col-span-1">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Identitas</h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div>
                <p className="text-xs text-slate-500">Nama Lengkap</p>
                <p className="font-medium text-slate-200">{latestCandidateProfile.fullName || "Tidak tersedia"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="text-slate-200">{latestCandidateProfile.email || "Tidak tersedia"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Telepon</p>
                <p className="text-slate-200">{latestCandidateProfile.phone || "Tidak tersedia"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Lokasi</p>
                <p className="text-slate-200">{latestCandidateProfile.location || "Tidak tersedia"}</p>
              </div>
              <div className="pt-2">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-medium text-slate-400">
                    Sumber: {latestCandidateProfile.sourceType === "manual_text" ? "Teks manual" : "File CV"}
                  </span>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-medium text-slate-400">
                    {latestCandidateProfile.manualTextUsed ? "Menggunakan teks manual" : "Menggunakan hasil upload"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Ringkasan Profesional</h3>
            <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
              {latestCandidateProfile.summary || "Ringkasan belum tersedia."}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Keahlian</h3>
            <div className="flex flex-wrap gap-2">
              {skills.length > 0 ? (
                skills.map((skill, i) => (
                  <span
                    key={i}
                    className="rounded-lg bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400 border border-blue-500/20"
                  >
                    {typeof skill === 'string' ? skill : JSON.stringify(skill)}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic">Belum ada skill yang terdeteksi.</p>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Experience, Education, Projects, Certs */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Pengalaman Kerja</h3>
            <div className="space-y-4">
              {experiences.length > 0 ? (
                experiences.map((exp, i) => (
                  <div key={i} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    {typeof exp === 'object' && exp !== null ? renderFlexibleObject(exp) : <p className="text-sm text-slate-300">{String(exp)}</p>}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic">Belum ada data pengalaman kerja yang terdeteksi.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Pendidikan</h3>
            <div className="space-y-4">
              {education.length > 0 ? (
                education.map((edu, i) => (
                  <div key={i} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    {typeof edu === 'object' && edu !== null ? renderFlexibleObject(edu) : <p className="text-sm text-slate-300">{String(edu)}</p>}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic">Belum ada data pendidikan yang terdeteksi.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Proyek</h3>
            <div className="space-y-4">
              {projects.length > 0 ? (
                projects.map((proj, i) => (
                  <div key={i} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    {typeof proj === 'object' && proj !== null ? renderFlexibleObject(proj) : <p className="text-sm text-slate-300">{String(proj)}</p>}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic">Belum ada project yang terdeteksi.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Sertifikasi</h3>
            <div className="flex flex-wrap gap-2">
              {certifications.length > 0 ? (
                certifications.map((cert, i) => (
                  <span
                    key={i}
                    className="rounded-lg bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20"
                  >
                    {typeof cert === 'string' ? cert : JSON.stringify(cert)}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic">Belum ada sertifikasi yang terdeteksi.</p>
              )}
            </div>
          </section>

          <details className="group rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
            <summary className="flex cursor-pointer items-center justify-between p-6 text-lg font-semibold text-white hover:bg-slate-800/50">
              Lihat Teks CV Asli
              <span className="text-slate-500 transition-transform group-open:rotate-180">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </span>
            </summary>
            <div className="border-t border-slate-800 p-6">
              <div className="max-h-[400px] overflow-y-auto rounded-lg bg-slate-950 p-4 text-xs font-mono text-slate-400 leading-relaxed">
                {latestCandidateProfile.rawCvText || "Teks CV tidak tersedia."}
              </div>
            </div>
          </details>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-[10px] text-slate-500">
            Disimpan dari CV: {latestUploadedCv?.fileName || "Tidak diketahui"} · Diperbarui {formatDate(latestCandidateProfile.updatedAt)}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
