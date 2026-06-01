"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";

type UploadResponse = {
  success?: boolean;
  uploadedCv?: {
    id: string;
    fileName: string;
    fileType: string;
    extractedText?: string | null;
  };
  error?: string;
};

type AnalyzeResponse = {
  success?: boolean;
  candidateProfile?: {
    id: string;
    fullName?: string | null;
    updatedAt?: string;
  };
  error?: string;
};

export default function CvUploadPage() {
  const [status, setStatus] = useState<string>("Unggah CV dalam format PDF, DOCX, TXT, atau MD.");
  const [extractPreview, setExtractPreview] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [latestUploadedCvId, setLatestUploadedCvId] = useState<string | null>(null);
  const [latestUploadedCvName, setLatestUploadedCvName] = useState<string>("");

  async function onSubmit(formData: FormData) {
    setIsUploading(true);
    setStatus("Sedang mengunggah CV...");
    setExtractPreview("");

    try {
      const response = await fetch("/api/cv/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as UploadResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unggah CV gagal.");
      }

      setLatestUploadedCvId(payload.uploadedCv?.id ?? null);
      setLatestUploadedCvName(payload.uploadedCv?.fileName ?? "CV tanpa nama");
      setStatus(`CV ${payload.uploadedCv?.fileName ?? ""} berhasil disimpan ke storage lokal.`.trim());
      setExtractPreview(payload.uploadedCv?.extractedText?.slice(0, 4000) ?? "");
    } catch (error) {
      setLatestUploadedCvId(null);
      setLatestUploadedCvName("");
      setStatus(error instanceof Error ? error.message : "Unggah CV gagal.");
    } finally {
      setIsUploading(false);
    }
  }

  async function analyzeLatestCv() {
    if (!latestUploadedCvId) {
      setStatus("Belum ada CV terbaru yang bisa dianalisis.");
      return;
    }

    setIsAnalyzing(true);
    setStatus(`Sedang menganalisis CV ${latestUploadedCvName} dengan 9router...`);

    try {
      const response = await fetch("/api/cv/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uploadedCvId: latestUploadedCvId }),
      });

      const payload = (await response.json()) as AnalyzeResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Analisis CV gagal.");
      }

      setStatus(
        `Analisis selesai. Profil kandidat terbaru: ${payload.candidateProfile?.fullName || "tanpa nama"}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Analisis CV gagal.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <AppShell
      title="Unggah CV"
      description="Unggah file CV ke storage lokal, lihat hasil ekstraksi teks nyata, lalu jalankan analisis profil AI secara eksplisit."
      actions={
        <Link
          href="/profile"
          className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Lihat Profil
        </Link>
      }
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <form action={onSubmit} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/20">
          <div className="flex flex-col gap-4">
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown"
              className="rounded-xl border border-dashed border-slate-700 bg-slate-950 px-4 py-10 text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-4 file:py-2 file:font-medium file:text-slate-950"
              required
            />
            <button
              type="submit"
              disabled={isUploading}
              className="rounded-xl bg-cyan-400 px-4 py-3 font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isUploading ? "Sedang mengunggah..." : "Unggah CV"}
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Analisis CV</h2>
              <p className="mt-2 text-sm text-slate-300">
                Jalankan analisis hanya setelah hasil ekstraksi terlihat benar.
              </p>
            </div>
            <button
              type="button"
              onClick={analyzeLatestCv}
              disabled={!latestUploadedCvId || isAnalyzing}
              className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
            >
              {isAnalyzing ? "Sedang menganalisis..." : "Analisis CV Terbaru"}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {latestUploadedCvId
              ? `CV terbaru siap dianalisis: ${latestUploadedCvName}`
              : "Belum ada CV terbaru di sesi ini."}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-medium">Status</h2>
          <p className="mt-2 text-sm text-slate-300">{status}</p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-medium">Pratinjau Teks Hasil Ekstraksi</h2>
          <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-300">
            {extractPreview || "Belum ada teks hasil ekstraksi."}
          </pre>
        </section>
      </div>
    </AppShell>
  );
}
