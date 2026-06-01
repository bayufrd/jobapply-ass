"use client";

import { AppShell } from "@/components/app-shell";
import { useState, useEffect, use } from "react";

type AnswersJson = {
  fieldsFilled: Array<{
    selector: string;
    label: string;
    value: string;
    filled: boolean;
  }>;
  questionAnswers: Array<{
    question: string;
    answer: string;
    confidence: number;
    source: string;
  }>;
  pendingQuestions: Array<{
    question: string;
    reason: string;
  }>;
};

type ApplicationData = {
  id: string;
  status: string;
  submitMode: string;
  notes: string | null;
  answersJson: string | null;
  screenshotPath: string | null;
  createdAt: string;
  campaign: {
    id: string;
    name: string;
    keyword: string;
  };
  jobListing: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    url: string;
    matchScore: number | null;
    matchReason: string | null;
    salaryText: string | null;
    workType: string | null;
  };
};

function statusLabel(status: string) {
  switch (status) {
    case "pending_review":
      return "Menunggu Review";
    case "approved":
      return "Disetujui";
    case "skipped":
      return "Dilewati";
    case "submitted":
      return "Terkirim";
    case "failed":
      return "Gagal";
    case "paused":
      return "Dijeda";
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "pending_review":
      return "text-amber-300 border-amber-500/30 bg-amber-500/10";
    case "approved":
      return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
    case "skipped":
      return "text-slate-400 border-slate-700 bg-slate-900";
    case "submitted":
      return "text-green-300 border-green-500/30 bg-green-500/10";
    case "failed":
      return "text-rose-300 border-rose-500/30 bg-rose-500/10";
    case "paused":
      return "text-cyan-300 border-cyan-500/30 bg-cyan-500/10";
    default:
      return "text-slate-300 border-slate-700 bg-slate-900";
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function confidenceColor(confidence: number) {
  if (confidence >= 0.8) return "text-emerald-300";
  if (confidence >= 0.6) return "text-amber-300";
  return "text-rose-300";
}

export default function ApplicationReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [answers, setAnswers] = useState<AnswersJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Gagal memuat data lamaran.");
        }
        return res.json();
      })
      .then((data) => {
        setApplication(data);
        if (data.answersJson) {
          try {
            setAnswers(JSON.parse(data.answersJson));
          } catch {
            // Ignore parse error
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <AppShell title="Review Lamaran" description="Tinjau detail lamaran sebelum mengirim.">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-slate-400">Memuat data lamaran...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !application) {
    return (
      <AppShell title="Review Lamaran" description="Tinjau detail lamaran sebelum mengirim.">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-rose-300">{error || "Lamaran tidak ditemukan."}</p>
          <a href="/applications" className="mt-4 inline-block text-sm text-cyan-300 hover:underline">
            ← Kembali ke daftar lamaran
          </a>
        </div>
      </AppShell>
    );
  }

  const job = application.jobListing;

  return (
    <AppShell
      title="Review Lamaran"
      description={`Tinjau lamaran untuk ${job.title} di ${job.company}`}
    >
      <div className="space-y-6">
        {/* Back link */}
        <a href="/applications" className="inline-block text-sm text-cyan-300 hover:underline">
          ← Kembali ke daftar lamaran
        </a>

        {/* Job Info */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">{job.title}</h2>
              <p className="text-slate-400">{job.company}</p>
              {job.location && <p className="mt-1 text-sm text-slate-500">{job.location}</p>}
              {job.salaryText && <p className="mt-1 text-sm text-emerald-300">{job.salaryText}</p>}
              {job.workType && <p className="mt-1 text-xs text-slate-500">{job.workType}</p>}
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.25em] ${statusColor(application.status)}`}
            >
              {statusLabel(application.status)}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {job.matchScore !== null && (
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5">
                <span className="text-slate-400">Skor AI:</span>{" "}
                <span className="font-medium text-cyan-300">{job.matchScore}</span>
              </div>
            )}
            <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5">
              <span className="text-slate-400">Kampanye:</span>{" "}
              <span className="font-medium text-white">{application.campaign.name}</span>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5">
              <span className="text-slate-400">Dibuat:</span>{" "}
              <span className="font-medium text-white">{formatDate(application.createdAt)}</span>
            </div>
          </div>

          {job.matchReason && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Alasan AI</p>
              <p className="mt-1">{job.matchReason}</p>
            </div>
          )}

          {application.notes && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Catatan</p>
              <p className="mt-1">{application.notes}</p>
            </div>
          )}

          {/* Warning for paused/manual intervention */}
          {application.status === "paused" && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
              <p className="font-medium">⚠️ Perlu perhatian manual</p>
              <p className="mt-1">Lamaran ini memerlukan tindakan manual Anda sebelum dapat dilanjutkan.</p>
            </div>
          )}
        </div>

        {/* Fields Filled */}
        {answers && answers.fieldsFilled.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold text-white">Field yang Diisi</h3>
            <div className="mt-4 space-y-2">
              {answers.fieldsFilled.map((field, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-4 py-2"
                >
                  <div>
                    <span className="text-sm font-medium text-slate-300">{field.label}</span>
                    {field.value && (
                      <span className="ml-2 text-sm text-slate-500">
                        {field.value.length > 50 ? `${field.value.substring(0, 50)}...` : field.value}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      field.filled ? "text-emerald-300" : "text-slate-500"
                    }`}
                  >
                    {field.filled ? "✓ Diisi" : "— Kosong"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions Answered */}
        {answers && answers.questionAnswers.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold text-white">Pertanyaan Dijawab</h3>
            <div className="mt-4 space-y-3">
              {answers.questionAnswers.map((qa, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-4"
                >
                  <p className="text-sm font-medium text-slate-300">{qa.question}</p>
                  <p className="mt-2 text-sm text-white">{qa.answer}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className={confidenceColor(qa.confidence)}>
                      Confidence: {Math.round(qa.confidence * 100)}%
                    </span>
                    <span className="text-slate-500">Sumber: {qa.source}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Questions */}
        {answers && answers.pendingQuestions.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
            <h3 className="text-lg font-semibold text-amber-300">Pertanyaan Belum Dijawab</h3>
            <p className="mt-1 text-sm text-amber-300/70">
              Pertanyaan berikut memerlukan jawaban dari Anda sebelum lamaran dapat dikirim.
            </p>
            <div className="mt-4 space-y-3">
              {answers.pendingQuestions.map((pq, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4"
                >
                  <p className="text-sm font-medium text-white">{pq.question}</p>
                  <p className="mt-1 text-xs text-amber-300/70">{pq.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold text-white">Aksi</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              disabled
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-500 cursor-not-allowed"
              title="Edit jawaban akan diaktifkan pada tahap berikutnya"
            >
              Edit Jawaban
            </button>
            <button
              disabled
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-500 cursor-not-allowed"
              title="Lewati lamaran akan diaktifkan pada tahap berikutnya"
            >
              Lewati Lamaran
            </button>
            <button
              disabled
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300/50 cursor-not-allowed"
              title="Submit final akan diaktifkan pada tahap berikutnya."
            >
              Setujui dan Kirim
            </button>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20"
            >
              Buka Jobstreet
            </a>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Submit final akan diaktifkan pada tahap berikutnya. Saat ini Anda hanya dapat mereview data yang sudah diisi.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
