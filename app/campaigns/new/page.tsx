"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";

type CreateCampaignResponse = {
  success?: boolean;
  campaign?: {
    id: string;
    name: string;
  };
  error?: string;
};

const defaults = [
  ["Ekspektasi Gaji", "Dari ENV bila kosong"],
  ["Gaji Saat Ini", "Dari ENV bila kosong"],
  ["Waktu Mulai Kerja", "Dari ENV bila kosong"],
  ["Ketersediaan", "Dari ENV bila kosong"],
  ["Mode Pengiriman Lamaran", "Auto Submit Aman"],
];

export default function NewCampaignPage() {
  const [status, setStatus] = useState("Isi form kampanye lalu simpan ke database lokal.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setStatus("Sedang menyimpan kampanye...");

    const parseOptionalNumber = (value: FormDataEntryValue | null) => {
      if (typeof value !== "string" || value.trim() === "") return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const parseOptionalString = (value: FormDataEntryValue | null) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    };

    const payload = {
      name: String(formData.get("name") || "").trim(),
      keyword: String(formData.get("keyword") || "").trim(),
      location: parseOptionalString(formData.get("location")),
      targetApplyCount: parseOptionalNumber(formData.get("targetApplyCount")),
      matchThreshold: parseOptionalNumber(formData.get("matchThreshold")),
      workModePreference: parseOptionalString(formData.get("workModePreference")),
      defaultCurrentSalary: parseOptionalNumber(formData.get("defaultCurrentSalary")),
      defaultExpectedSalary: parseOptionalNumber(formData.get("defaultExpectedSalary")),
      defaultNoticePeriod: parseOptionalString(formData.get("defaultNoticePeriod")),
      defaultAvailability: parseOptionalString(formData.get("defaultAvailability")),
      submitMode: String(formData.get("submitMode") || "assisted_auto_apply") as
        | "assisted_auto_apply"
        | "manual_review_only",
      automationMode: String(formData.get("automationMode") || "auto_submit_safe_only") as
        | "review_each_application"
        | "auto_submit_safe_only",
      formAutomationMode: String(formData.get("formAutomationMode") || "mcp_ai_first") as
        | "mcp_ai_first"
        | "deterministic_first"
        | "ai_fallback"
        | "ai_first",
      lowScoreMode: String(formData.get("lowScoreMode") || "ask") as
        | "ask"
        | "auto_skip"
        | "auto_apply",
      autoSubmitSafeOnly: String(formData.get("automationMode") || "auto_submit_safe_only") === "auto_submit_safe_only",
    };

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as CreateCampaignResponse;

      if (!response.ok) {
        throw new Error(result.error || "Gagal menyimpan kampanye.");
      }

      setStatus(`Kampanye ${result.campaign?.name || "baru"} berhasil disimpan.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Gagal menyimpan kampanye.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell
      title="Buat Kampanye"
      description="Simpan kampanye baru ke SQLite. Autopilot akan mencari lowongan, melamar, mengisi form, dan submit otomatis jika aman. Jika ada pertanyaan yang tidak pasti, sistem hanya akan meminta Anda memilih Accept/Reject/Yes/No dari halaman kampanye."
      actions={
        <Link
          href="/campaigns"
          className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Lihat Daftar Kampanye
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form action={handleSubmit} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Form Kampanye</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Nama Kampanye</span>
              <input name="name" required className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Kata Kunci Lowongan</span>
              <input name="keyword" required className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Lokasi</span>
              <input name="location" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Target Jumlah Lamaran</span>
              <input name="targetApplyCount" type="number" min="1" defaultValue="1" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Batas Minimal Kecocokan</span>
              <input name="matchThreshold" type="number" min="0" max="100" defaultValue="70" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Preferensi Sistem Kerja</span>
              <input name="workModePreference" placeholder="Hybrid / Remote / Onsite" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Gaji Saat Ini</span>
              <input name="defaultCurrentSalary" type="number" placeholder="Kosongkan untuk pakai ENV" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Ekspektasi Gaji</span>
              <input name="defaultExpectedSalary" type="number" placeholder="Kosongkan untuk pakai ENV" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Notice Period</span>
              <input name="defaultNoticePeriod" placeholder="Kosongkan untuk pakai ENV" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Ketersediaan</span>
              <input name="defaultAvailability" placeholder="Kosongkan untuk pakai ENV" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            </label>
            <div className="grid gap-3 text-sm text-slate-300 md:col-span-2">
              <span className="font-medium text-white">Mode Pengiriman Lamaran</span>
              <label className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <div className="flex items-start gap-3">
                  <input type="radio" name="automationMode" value="auto_submit_safe_only" defaultChecked className="mt-1" />
                  <div>
                    <p className="font-medium text-cyan-200">Jalankan Kampanye Autopilot</p>
                    <p className="mt-1 text-sm text-slate-300">Sistem akan mencari lowongan, membuka lowongan, melamar, mengisi form, menekan lanjut, lalu submit otomatis jika aman tanpa kalibrasi manual.</p>
                  </div>
                </div>
              </label>
              <label className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex items-start gap-3">
                  <input type="radio" name="automationMode" value="review_each_application" className="mt-1" />
                  <div>
                    <p className="font-medium text-white">Review Setiap Lamaran</p>
                    <p className="mt-1 text-sm text-slate-400">Sistem tetap bisa berhenti sebelum submit final untuk mode manual, tetapi ini bukan jalur utama Autopilot.</p>
                  </div>
                </div>
              </label>
              <input type="hidden" name="submitMode" value="assisted_auto_apply" />
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                Browser tetap terlihat. Sistem hanya akan meminta interaksi manual untuk captcha, OTP, login, atau verifikasi keamanan. Pertanyaan form normal akan muncul di halaman kampanye.
              </p>
            </div>
            <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
              <span>Mode Pengisian Form</span>
              <select name="formAutomationMode" defaultValue="mcp_ai_first" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                <option value="mcp_ai_first">MCP AI First — disarankan</option>
                <option value="ai_first">AI First DOM</option>
                <option value="ai_fallback">AI Fallback</option>
                <option value="deterministic_first">Deterministic</option>
              </select>
              <p className="text-xs text-slate-400">MCP AI First: AI membaca struktur halaman nyata melalui Playwright MCP, lalu memilih tombol/field yang aman untuk diklik atau diisi. Mode ini paling cocok untuk form Jobstreet yang sering berubah.</p>
            </label>
            <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
              <span>Perilaku untuk Skor Rendah</span>
              <select name="lowScoreMode" defaultValue="ask" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                <option value="ask">Tanya saya dulu</option>
                <option value="auto_skip">Lewati otomatis</option>
                <option value="auto_apply">Tetap lamar otomatis</option>
              </select>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-cyan-400 px-4 py-3 font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isSubmitting ? "Sedang menyimpan..." : "Simpan Kampanye"}
            </button>
          </div>

          <p className="mt-4 text-sm text-slate-300">{status}</p>
        </form>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Nilai Default</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {defaults.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <span>{label}</span>
                <span className="text-cyan-300">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
            Pencarian Jobstreet, AI scoring, AI First form filling, dan Auto Submit Aman tersedia dengan browser tetap terlihat, tanpa bypass captcha, tanpa stealth automation, dan tanpa proxy rotation.
          </div>
        </section>
      </div>
    </AppShell>
  );
}
