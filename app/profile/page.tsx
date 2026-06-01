import { AppShell } from "@/components/app-shell";
import { getProfileData } from "@/lib/dashboard/data";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function parseJsonArray(value?: string | null) {
  if (!value) return [] as string[];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as string[];
  }
}

export default async function ProfilePage() {
  const { latestCandidateProfile, latestUploadedCv } = await getProfileData();

  const skills = parseJsonArray(latestCandidateProfile?.skillsJson);
  const experiences = parseJsonArray(latestCandidateProfile?.experienceJson);
  const education = parseJsonArray(latestCandidateProfile?.educationJson);
  const projects = parseJsonArray(latestCandidateProfile?.projectsJson);
  const certifications = parseJsonArray(latestCandidateProfile?.certificationsJson);

  return (
    <AppShell
      title="Profil Kandidat"
      description="Tinjau hasil analisis CV terbaru yang benar-benar tersimpan di database sebelum kampanye dijalankan."
    >
      {!latestCandidateProfile ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          <p className="font-medium text-white">Belum ada profil kandidat.</p>
          <p className="mt-2">
            Unggah CV lalu jalankan analisis agar profil kandidat tersimpan di database.
          </p>
          <p className="mt-2 text-slate-500">
            CV terbaru: {latestUploadedCv ? latestUploadedCv.fileName : "Belum ada CV terunggah"}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold">Ringkasan Profil</h3>
            <div className="mt-4 grid gap-4 text-sm text-slate-300">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="font-medium text-white">Identitas</p>
                <p className="mt-2">Nama: {latestCandidateProfile.fullName || "Tidak tersedia"}</p>
                <p>Email: {latestCandidateProfile.email || "Tidak tersedia"}</p>
                <p>Telepon: {latestCandidateProfile.phone || "Tidak tersedia"}</p>
                <p>Lokasi: {latestCandidateProfile.location || "Tidak tersedia"}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="font-medium text-white">Ringkasan</p>
                <p className="mt-2 whitespace-pre-wrap">
                  {latestCandidateProfile.summary || "Ringkasan belum tersedia."}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-500">
                Disimpan dari CV: {latestUploadedCv?.fileName || "Tidak diketahui"} · Diperbarui {formatDate(latestCandidateProfile.updatedAt)}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold">Data Terstruktur</h3>
            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="font-medium text-white">Keahlian</p>
                <p className="mt-2 whitespace-pre-wrap">{skills.length ? skills.join(", ") : "Belum ada data."}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="font-medium text-white">Pengalaman</p>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                  {experiences.length ? JSON.stringify(experiences, null, 2) : "Belum ada data."}
                </pre>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="font-medium text-white">Pendidikan</p>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                  {education.length ? JSON.stringify(education, null, 2) : "Belum ada data."}
                </pre>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="font-medium text-white">Proyek</p>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                  {projects.length ? JSON.stringify(projects, null, 2) : "Belum ada data."}
                </pre>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="font-medium text-white">Sertifikasi</p>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                  {certifications.length ? JSON.stringify(certifications, null, 2) : "Belum ada data."}
                </pre>
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
