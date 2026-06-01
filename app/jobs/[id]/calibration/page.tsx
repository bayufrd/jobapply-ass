"use client";

import { AppShell } from "@/components/app-shell";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

type CalibrationData = {
  id: string;
  jobListingId: string;
  campaignId: string | null;
  flowType: string | null;
  platform: string | null;
  currentUrl: string | null;
  pageTitle: string | null;
  detectedFieldsJson: string | null;
  detectedQuestionsJson: string | null;
  detectedButtonsJson: string | null;
  submitCandidatesJson: string | null;
  screenshotPath: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  jobListing: {
    id: string;
    title: string;
    company: string;
    url: string;
    status: string;
  } | null;
};

type DetectedFields = {
  inputs: Array<{
    label: string;
    placeholder: string;
    name: string;
    type: string;
    required: boolean;
    visible: boolean;
  }>;
  textareas: Array<{
    label: string;
    placeholder: string;
    name: string;
    required: boolean;
  }>;
  selects: Array<{
    label: string;
    name: string;
    optionCount: number;
    required: boolean;
  }>;
};

type DetectedQuestion = {
  text: string;
  source: string;
};

type DetectedButton = {
  text: string;
  tag: string;
  type: string;
  disabled: boolean;
};

type SubmitCandidate = {
  text: string;
  tag: string;
  type: string;
  selector: string;
};

function flowTypeLabel(flowType: string | null) {
  switch (flowType) {
    case "jobstreet_internal":
      return "Internal Jobstreet";
    case "external_redirect":
      return "External";
    case "email_apply":
      return "Email Apply";
    case "whatsapp_apply":
      return "WhatsApp Apply";
    default:
      return "Tidak Diketahui";
  }
}

function flowTypeColor(flowType: string | null) {
  switch (flowType) {
    case "jobstreet_internal":
      return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
    case "external_redirect":
      return "text-amber-300 border-amber-500/30 bg-amber-500/10";
    case "email_apply":
      return "text-cyan-300 border-cyan-500/30 bg-cyan-500/10";
    case "whatsapp_apply":
      return "text-green-300 border-green-500/30 bg-green-500/10";
    default:
      return "text-slate-400 border-slate-700 bg-slate-900";
  }
}

function platformLabel(platform: string | null) {
  switch (platform) {
    case "jobstreet":
      return "Jobstreet";
    case "google_form":
      return "Google Form";
    case "greenhouse":
      return "Greenhouse";
    case "lever":
      return "Lever";
    case "workday":
      return "Workday";
    case "company_site":
      return "Website Perusahaan";
    default:
      return "Tidak Diketahui";
  }
}

function riskLabel(risk: string) {
  switch (risk) {
    case "low":
      return "Rendah";
    case "medium":
      return "Sedang";
    case "high":
      return "Tinggi";
    default:
      return risk;
  }
}

function riskColor(risk: string) {
  switch (risk) {
    case "low":
      return "text-emerald-300";
    case "medium":
      return "text-amber-300";
    case "high":
      return "text-rose-300";
    default:
      return "text-slate-400";
  }
}

function recommendAction(flowType: string | null, platform: string | null) {
  if (flowType === "jobstreet_internal" && platform === "jobstreet") {
    return "Flow internal Jobstreet. Lanjutkan ke assisted apply dengan form filling otomatis.";
  }
  if (flowType === "external_redirect") {
    return "Lowongan ini mengarah ke website eksternal. Sistem perlu mode pengisian eksternal dan review user sebelum bisa melanjutkan.";
  }
  if (flowType === "email_apply") {
    return "Apply via email. Sistem perlu menyiapkan draft email dengan CV terlampir.";
  }
  if (flowType === "whatsapp_apply") {
    return "Apply via WhatsApp. Sistem perlu menyiapkan pesan WhatsApp.";
  }
  return "Perlu review manual untuk menentukan langkah selanjutnya.";
}

export default function CalibrationPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCalibration() {
      try {
        const res = await fetch(`/api/jobs/${jobId}/calibration`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Gagal memuat data kalibrasi.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setCalibration(data.calibration);
      } catch {
        setError("Terjadi kesalahan saat memuat data kalibrasi.");
      } finally {
        setLoading(false);
      }
    }
    fetchCalibration();
  }, [jobId]);

  const fields: DetectedFields = calibration?.detectedFieldsJson
    ? JSON.parse(calibration.detectedFieldsJson)
    : { inputs: [], textareas: [], selects: [] };
  const questions: DetectedQuestion[] = calibration?.detectedQuestionsJson
    ? JSON.parse(calibration.detectedQuestionsJson)
    : [];
  const buttons: DetectedButton[] = calibration?.detectedButtonsJson
    ? JSON.parse(calibration.detectedButtonsJson)
    : [];
  const submitCandidates: SubmitCandidate[] = calibration?.submitCandidatesJson
    ? JSON.parse(calibration.submitCandidatesJson)
    : [];

  // Determine risk from submit candidates
  let finalSubmitRisk = "low";
  if (submitCandidates.length === 0) finalSubmitRisk = "medium";
  if (
    calibration?.flowType === "external_redirect" ||
    calibration?.flowType === "unknown"
  )
    finalSubmitRisk = "high";

  if (loading) {
    return (
      <AppShell
        title="Hasil Kalibrasi"
        description="Detail hasil kalibrasi dry run apply untuk lowongan ini."
      >
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-slate-400">Memuat data kalibrasi...</p>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell
        title="Hasil Kalibrasi"
        description="Detail hasil kalibrasi dry run apply untuk lowongan ini."
      >
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
          <p className="text-rose-300">{error}</p>
          <a
            href="/jobs"
            className="mt-4 inline-block text-sm text-cyan-300 hover:underline"
          >
            ← Kembali ke Lowongan
          </a>
        </div>
      </AppShell>
    );
  }

  if (!calibration) {
    return (
      <AppShell
        title="Hasil Kalibrasi"
        description="Detail hasil kalibrasi dry run apply untuk lowongan ini."
      >
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-slate-400">
            Belum ada data kalibrasi untuk lowongan ini.
          </p>
          <a
            href="/jobs"
            className="mt-4 inline-block text-sm text-cyan-300 hover:underline"
          >
            ← Kembali ke Lowongan
          </a>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Hasil Kalibrasi"
      description={`Kalibrasi dry run apply untuk "${calibration.jobListing?.title ?? "lowongan"}"`}
    >
      <div className="grid gap-6">
        {/* Job Info */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
            Info Lowongan
          </h2>
          <p className="mt-2 font-medium text-white">
            {calibration.jobListing?.title}
          </p>
          <p className="text-sm text-slate-400">
            {calibration.jobListing?.company}
          </p>
          {calibration.jobListing?.url && (
            <a
              href={calibration.jobListing.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-cyan-300 hover:underline"
            >
              Buka di Jobstreet ↗
            </a>
          )}
        </div>

        {/* Flow Classification */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Tipe Flow
            </p>
            <div
              className={`mt-2 inline-block rounded-lg border px-3 py-1.5 text-sm font-medium ${flowTypeColor(calibration.flowType)}`}
            >
              {flowTypeLabel(calibration.flowType)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Platform
            </p>
            <p className="mt-2 text-lg font-medium text-white">
              {platformLabel(calibration.platform)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Risiko Submit
            </p>
            <p
              className={`mt-2 text-lg font-medium ${riskColor(finalSubmitRisk)}`}
            >
              {riskLabel(finalSubmitRisk)}
            </p>
          </div>
        </div>

        {/* Current URL */}
        {calibration.currentUrl && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              URL Saat Ini
            </p>
            <p className="mt-2 break-all text-sm text-slate-300">
              {calibration.currentUrl}
            </p>
          </div>
        )}

        {/* Notes / Recommendation */}
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-cyan-400">
            Rekomendasi
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {recommendAction(calibration.flowType, calibration.platform)}
          </p>
          {calibration.notes && (
            <p className="mt-2 text-xs text-slate-500">
              Catatan: {calibration.notes}
            </p>
          )}
        </div>

        {/* Detected Fields */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Field Terdeteksi
          </p>
          {fields.inputs.length === 0 &&
          fields.textareas.length === 0 &&
          fields.selects.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Tidak ada field yang terdeteksi.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {fields.inputs.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Input ({fields.inputs.length})
                  </p>
                  <div className="mt-1 grid gap-1">
                    {fields.inputs.map((inp, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-slate-300"
                      >
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                          {inp.type || "text"}
                        </span>
                        <span>{inp.label || inp.name || "(tanpa label)"}</span>
                        {inp.required && (
                          <span className="text-rose-400">*</span>
                        )}
                        {!inp.visible && (
                          <span className="text-slate-600">(tersembunyi)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {fields.textareas.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Textarea ({fields.textareas.length})
                  </p>
                  <div className="mt-1 grid gap-1">
                    {fields.textareas.map((ta, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-slate-300"
                      >
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                          textarea
                        </span>
                        <span>{ta.label || ta.name || "(tanpa label)"}</span>
                        {ta.required && (
                          <span className="text-rose-400">*</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {fields.selects.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Select ({fields.selects.length})
                  </p>
                  <div className="mt-1 grid gap-1">
                    {fields.selects.map((sel, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-slate-300"
                      >
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                          select
                        </span>
                        <span>
                          {sel.label || sel.name || "(tanpa label)"}{" "}
                          <span className="text-slate-500">
                            ({sel.optionCount} opsi)
                          </span>
                        </span>
                        {sel.required && (
                          <span className="text-rose-400">*</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detected Questions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Pertanyaan Terdeteksi
          </p>
          {questions.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Tidak ada pertanyaan yang terdeteksi.
            </p>
          ) : (
            <div className="mt-3 space-y-1">
              {questions.map((q, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-sm text-slate-300"
                >
                  <span className="mt-0.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {q.source}
                  </span>
                  <span>{q.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detected Buttons */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Tombol Terdeteksi
          </p>
          {buttons.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Tidak ada tombol yang terdeteksi.
            </p>
          ) : (
            <div className="mt-3 grid gap-1">
              {buttons.map((btn, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs text-slate-300"
                >
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                    {btn.tag}
                    {btn.type ? `[${btn.type}]` : ""}
                  </span>
                  <span>{btn.text || "(tanpa teks)"}</span>
                  {btn.disabled && (
                    <span className="text-slate-500">(nonaktif)</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit Candidates */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Kandidat Tombol Submit
          </p>
          {submitCandidates.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Tidak ada kandidat tombol submit yang terdeteksi.
            </p>
          ) : (
            <div className="mt-3 space-y-1">
              {submitCandidates.map((sc, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs text-slate-300"
                >
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                    {sc.tag}
                    {sc.type ? `[${sc.type}]` : ""}
                  </span>
                  <span>{sc.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Screenshot */}
        {calibration.screenshotPath && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Screenshot
            </p>
            <p className="mt-2 break-all text-xs text-slate-400">
              {calibration.screenshotPath}
            </p>
          </div>
        )}

        {/* Back link */}
        <div>
          <a
            href="/jobs"
            className="text-sm text-cyan-300 hover:underline"
          >
            ← Kembali ke Lowongan
          </a>
        </div>
      </div>
    </AppShell>
  );
}
