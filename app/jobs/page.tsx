"use client";

import { AppShell } from "@/components/app-shell";
import { getJobsData } from "@/lib/dashboard/data";
import { useState, useEffect } from "react";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string) {
  switch (status) {
    case "discovered":
      return "Ditemukan";
    case "shortlisted":
      return "Shortlist";
    case "skipped":
      return "Dilewati";
    case "applying":
      return "Sedang melamar";
    case "submitted":
      return "Lamaran terkirim";
    case "failed":
      return "Gagal";
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "discovered":
      return "text-cyan-300";
    case "shortlisted":
      return "text-emerald-300";
    case "skipped":
      return "text-slate-400";
    case "applying":
      return "text-amber-300";
    case "submitted":
      return "text-green-300";
    case "failed":
      return "text-rose-300";
    default:
      return "text-slate-300";
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof getJobsData>>>([]);
  const [loading, setLoading] = useState(true);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);

  useEffect(() => {
    getJobsData().then((data) => {
      setJobs(data);
      setLoading(false);
    });
  }, []);

  async function handleApply(jobId: string) {
    if (applyingJobId) return;
    
    setApplyingJobId(jobId);
    try {
      const response = await fetch(`/api/jobs/${jobId}/apply/start`, {
        method: "POST",
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        alert(result.error || "Gagal memulai proses lamaran");
        return;
      }
      
      alert(result.message || "Proses lamaran dimulai");
      
      // Refresh jobs data
      const updatedJobs = await getJobsData();
      setJobs(updatedJobs);
    } catch (error) {
      alert("Terjadi kesalahan saat memulai proses lamaran");
      console.error(error);
    } finally {
      setApplyingJobId(null);
    }
  }

  if (loading) {
    return (
      <AppShell
        title="Lowongan"
        description="Tinjau lowongan yang ditemukan dari Jobstreet, detail yang terlihat, skor AI, dan alasan sebuah lowongan dipilih atau dilewati."
      >
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-slate-400">Memuat lowongan...</p>
        </div>
      </AppShell>
    );
  }

  const allJobs = jobs;
  const shortlistedJobs = jobs.filter((j) => j.status === "shortlisted");
  const skippedJobs = jobs.filter((j) => j.status === "skipped");
  const unscored = jobs.filter((j) => j.matchScore === null);

  return (
    <AppShell
      title="Lowongan"
      description="Tinjau lowongan yang ditemukan dari Jobstreet, detail yang terlihat, skor AI, dan alasan sebuah lowongan dipilih atau dilewati."
    >
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center">
            <p className="text-slate-400">
              Belum ada lowongan tersimpan. Jalankan kampanye untuk mulai mencari lowongan.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-3 text-sm">
              <div className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2">
                <span className="text-slate-400">Semua:</span>{" "}
                <span className="font-medium text-white">{allJobs.length}</span>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
                <span className="text-slate-400">Shortlist:</span>{" "}
                <span className="font-medium text-emerald-300">{shortlistedJobs.length}</span>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2">
                <span className="text-slate-400">Dilewati:</span>{" "}
                <span className="font-medium text-slate-400">{skippedJobs.length}</span>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2">
                <span className="text-slate-400">Belum dinilai:</span>{" "}
                <span className="font-medium text-slate-500">{unscored.length}</span>
              </div>
            </div>

            <div className="grid gap-4">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-white">{job.title}</p>
                      <p className="text-sm text-slate-400">{job.company}</p>
                      {job.location && (
                        <p className="mt-1 text-xs text-slate-500">{job.location}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {job.matchScore !== null ? (
                        <div className="text-right">
                          <p className="text-sm font-medium text-cyan-300">Skor {job.matchScore}</p>
                          <p className={`text-xs font-medium ${statusColor(job.status)}`}>
                            {statusLabel(job.status)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Belum dinilai</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
                    {job.salaryText && (
                      <p className="text-emerald-300">{job.salaryText}</p>
                    )}
                    {job.workType && (
                      <p className="text-slate-400">{job.workType}</p>
                    )}
                    {job.campaign && (
                      <p className="text-xs text-slate-500">
                        Kampanye: {job.campaign.name}
                      </p>
                    )}
                  </div>

                  {job.matchReason && (
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Alasan AI
                      </p>
                      <p className="mt-1">{job.matchReason}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">{formatDate(job.createdAt)}</p>
                    <div className="flex gap-2">
                      {job.status === "shortlisted" ? (
                        <button
                          onClick={() => handleApply(job.id)}
                          disabled={applyingJobId !== null}
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {applyingJobId === job.id ? "Memproses..." : "Bantu Lamar"}
                        </button>
                      ) : (
                        <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-500">
                          {job.status === "skipped" ? "Lowongan dilewati" : "Belum masuk shortlist"}
                        </div>
                      )}
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                      >
                        Buka Jobstreet
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
