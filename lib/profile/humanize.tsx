import React from "react";

const KEY_LABELS: Record<string, string> = {
  workExperience: "Pengalaman Kerja",
  techStack: "Tech Stack",
  startDate: "Tanggal Mulai",
  endDate: "Tanggal Selesai",
  fullName: "Nama Lengkap",
  phone: "Nomor Telepon",
  company: "Perusahaan",
  role: "Jabatan",
  position: "Posisi",
  duration: "Durasi",
  period: "Periode",
  year: "Tahun",
  institution: "Institusi",
  university: "Universitas",
  school: "Sekolah",
  degree: "Gelar",
  major: "Jurusan",
  description: "Deskripsi",
  responsibilities: "Tanggung Jawab",
  detail: "Detail",
  name: "Nama",
  title: "Judul",
  technologies: "Teknologi",
  certification: "Sertifikasi",
};

export function humanizeKey(key: string): string {
  const normalized = key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  const compact = key.replace(/[_-]+/g, "");

  return KEY_LABELS[key] ?? KEY_LABELS[compact] ?? normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Tidak tersedia";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") return String(item);
        if (typeof item === "object" && item !== null) {
          return Object.values(item)
            .filter((nested) => typeof nested === "string" || typeof nested === "number")
            .map(String)
            .join(" • ");
        }
        return "";
      })
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([nestedKey, nestedValue]) => `${humanizeKey(nestedKey)}: ${formatValue(nestedValue)}`)
      .join(" • ");
  }

  return String(value);
}

export function renderFlexibleObject(obj: unknown): React.ReactElement {
  if (typeof obj !== "object" || obj === null) return <></>;

  return (
    <dl className="grid grid-cols-1 gap-3 text-sm">
      {Object.entries(obj as Record<string, unknown>).map(([k, v]) => (
        <div key={k} className="grid gap-1 rounded-lg border border-slate-800/80 bg-slate-900/60 p-3 sm:grid-cols-[140px_1fr] sm:items-start">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{humanizeKey(k)}</dt>
          <dd className="text-sm leading-relaxed text-slate-200 break-words">{formatValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
