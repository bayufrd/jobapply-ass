"use client";

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

export default function CvUploadPage() {
  const [status, setStatus] = useState<string>("Upload a CV in PDF, DOCX, TXT, or MD format.");
  const [extractPreview, setExtractPreview] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  async function onSubmit(formData: FormData) {
    setIsUploading(true);
    setStatus("Uploading CV...");
    setExtractPreview("");

    try {
      const response = await fetch("/api/cv/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as UploadResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Upload failed.");
      }

      setStatus(`Saved ${payload.uploadedCv?.fileName ?? "CV"} successfully.`);
      setExtractPreview(payload.uploadedCv?.extractedText?.slice(0, 2000) ?? "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <AppShell
      title="CV Upload"
      description="Upload CV files locally, extract text, and prepare the profile analysis step before any browser automation starts."
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
              {isUploading ? "Uploading..." : "Upload CV"}
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-medium">Status</h2>
          <p className="mt-2 text-sm text-slate-300">{status}</p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-medium">Extracted Text Preview</h2>
          <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-300">
            {extractPreview || "No extracted text yet."}
          </pre>
        </section>
      </div>
    </AppShell>
  );
}
