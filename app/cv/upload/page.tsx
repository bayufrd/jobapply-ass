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
  const [status, setStatus] = useState<string>(
    "Unggah CV dalam format PDF, DOCX, TXT, atau MD.",
  );
  const [extractPreview, setExtractPreview] = useState<string>("");
  const [manualCvText, setManualCvText] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [latestUploadedCvId, setLatestUploadedCvId] = useState<string | null>(
    null,
  );
  const [latestUploadedCvName, setLatestUploadedCvName] = useState<string>("");

  const isManualValid = manualCvText.trim().length >= 300;
  const isExtractedValid = extractPreview.trim().length >= 300;
  const canAnalyze = isManualValid || isExtractedValid;

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
    if (!canAnalyze) {
      setStatus(
        "Teks CV terlalu pendek. Pastikan isi CV yang ditempel atau hasil ekstraksi cukup lengkap (min. 300 karakter) sebelum dianalisis.",
      );
      return;
    }

    setIsAnalyzing(true);
    const sourceLabel = isManualValid
      ? "teks manual"
      : `file ${latestUploadedCvName}`;
    setStatus(`Sedang menganalisis CV menggunakan ${sourceLabel}...`);

    try {
      const response = await fetch("/api/cv/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uploadedCvId: latestUploadedCvId,
          manualCvText: isManualValid ? manualCvText : undefined,
          sourceType: isManualValid ? "manual_text" : "uploaded_file",
        }),
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Opsi 1: Unggah File CV */}
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/20">
            <h2 className="text-lg font-medium">Opsi 1: Unggah File CV</h2>
            <form action={onSubmit} className="flex flex-col gap-4">
              <input
                name="file"
                type="file"
                accept=".pdf,.docx,.txt,.md,.markdown"
                className="rounded-xl border border-dashed border-slate-700 bg-slate-950 px-4 py-6 text-xs text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-950"
                required
              />
              <button
                type="submit"
                disabled={isUploading}
                className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isUploading ? "Sedang mengunggah..." : "Unggah CV"}
              </button>
            </form>
            {extractPreview && (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-400">
                  Preview Teks CV ({extractPreview.length} karakter):
                </p>
                <div className="mt-1 max-h-32 overflow-auto rounded-lg bg-slate-950 p-2 text-[10px] text-slate-400">
                  {extractPreview.slice(0, 500)}...
                </div>
                {!isExtractedValid && (
                  <p className="mt-2 text-[10px] text-amber-400">
                    ⚠️ Hasil ekstraksi terlalu pendek. Silakan gunakan Opsi 2.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Opsi 2: Tempel Teks CV Manual */}
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/20">
            <h2 className="text-lg font-medium">Opsi 2: Tempel Teks CV Manual</h2>
            <div className="flex flex-col gap-2">
              <textarea
                value={manualCvText}
                onChange={(e) => setManualCvText(e.target.value)}
                placeholder="Tempel isi CV kamu di sini jika upload file gagal dibaca atau hasil ekstraksinya tidak sesuai."
                className="h-32 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  Jumlah Karakter: {manualCvText.length}
                </span>
                {manualCvText.length > 0 && !isManualValid && (
                  <span className="text-[10px] text-amber-400">
                    Min. 300 karakter
                  </span>
                )}
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Analisis CV</h2>
              <p className="mt-2 text-sm text-slate-300">
                {isManualValid
                  ? "Menggunakan teks manual untuk analisis."
                  : isExtractedValid
                    ? "Menggunakan hasil upload untuk analisis."
                    : "Unggah file atau tempel teks CV untuk memulai analisis."}
              </p>
            </div>
            <button
              type="button"
              onClick={analyzeLatestCv}
              disabled={!canAnalyze || isAnalyzing}
              className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-6 py-3 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
            >
              {isAnalyzing ? "Sedang menganalisis..." : "Analisis CV"}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {isManualValid
              ? "Prioritas: Menggunakan teks manual."
              : latestUploadedCvId
                ? `File siap: ${latestUploadedCvName}`
                : "Belum ada data CV."}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-medium">Status</h2>
          <p className="mt-2 text-sm text-slate-300">{status}</p>
        </section>

        {extractPreview && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-medium">Pratinjau Teks Hasil Ekstraksi</h2>
            <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-300">
              {extractPreview}
            </pre>
          </section>
        )}
      </div>
    </AppShell>
  );
}
