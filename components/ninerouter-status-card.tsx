"use client";

import { useState } from "react";

type NineRouterStatusCardProps = {
  initialConfigured: boolean;
  initialRootUrl: string;
  initialChatModel: string;
  initialEmbeddingModel: string;
  initialMissingFields: string[];
};

type HealthResponse = {
  success: boolean;
  status: string;
  message: string;
  rootUrl: string | null;
  activeBaseUrl: string | null;
  chatModel: string | null;
  embeddingModel: string | null;
  missingFields: string[];
};

type ModelsResponse = {
  success: boolean;
  message: string;
  chatModels: string[];
  embeddingModels: string[];
  errors?: string[];
};

function renderStatusLabel(status: string, configured: boolean) {
  if (status === "terhubung") return "Terhubung";
  if (status === "gagal") return "Gagal";
  if (status === "error") return "Error";
  if (status === "belum_terkonfigurasi") return "Belum terkonfigurasi";
  return configured ? "Siap dicek" : "Belum terkonfigurasi";
}

export function NineRouterStatusCard({
  initialConfigured,
  initialRootUrl,
  initialChatModel,
  initialEmbeddingModel,
  initialMissingFields,
}: NineRouterStatusCardProps) {
  const [status, setStatus] = useState(initialConfigured ? "siap" : "belum_terkonfigurasi");
  const [message, setMessage] = useState(
    initialConfigured
      ? "Konfigurasi 9router terdeteksi. Jalankan cek koneksi untuk verifikasi runtime."
      : "Konfigurasi 9router belum lengkap. Pastikan ENV utama sudah diisi.",
  );
  const [rootUrl, setRootUrl] = useState(initialRootUrl || "Belum tersedia");
  const [activeBaseUrl, setActiveBaseUrl] = useState(
    initialRootUrl ? `${initialRootUrl.replace(/\/+$/, "")}/v1` : "Belum tersedia",
  );
  const [chatModel, setChatModel] = useState(initialChatModel || "Belum dipilih");
  const [embeddingModel, setEmbeddingModel] = useState(initialEmbeddingModel || "Belum dipilih");
  const [missingFields, setMissingFields] = useState<string[]>(initialMissingFields);
  const [chatModels, setChatModels] = useState<string[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  async function handleCheckConnection() {
    setIsChecking(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/settings/9router/health", {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as HealthResponse;

      setStatus(data.status || (data.success ? "terhubung" : "error"));
      setMessage(data.message || "Status koneksi 9router tidak tersedia.");
      setRootUrl(data.rootUrl || "Belum tersedia");
      setActiveBaseUrl(data.activeBaseUrl || "Belum tersedia");
      setChatModel(data.chatModel || "Belum dipilih");
      setEmbeddingModel(data.embeddingModel || "Belum dipilih");
      setMissingFields(data.missingFields || []);

      if (!response.ok) {
        setErrorMessage(data.message || "Cek koneksi 9router gagal.");
      }
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "Cek koneksi 9router gagal.";
      setMessage("Cek koneksi 9router gagal.");
      setErrorMessage(`Tidak dapat memeriksa koneksi 9router. ${message}`);
    } finally {
      setIsChecking(false);
    }
  }

  async function handleLoadModels() {
    setIsLoadingModels(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/settings/9router/models", {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as ModelsResponse & Partial<HealthResponse>;

      setChatModels(data.chatModels || []);
      setEmbeddingModels(data.embeddingModels || []);

      if (typeof data.chatModel === "string" && data.chatModel) {
        setChatModel(data.chatModel);
      }

      if (typeof data.embeddingModel === "string" && data.embeddingModel) {
        setEmbeddingModel(data.embeddingModel);
      }

      if (typeof data.rootUrl === "string" && data.rootUrl) {
        setRootUrl(data.rootUrl);
      }

      if (typeof data.activeBaseUrl === "string" && data.activeBaseUrl) {
        setActiveBaseUrl(data.activeBaseUrl);
      }

      if (Array.isArray(data.missingFields)) {
        setMissingFields(data.missingFields);
      }

      setMessage(data.message || "Daftar model 9router berhasil dimuat.");

      if (!response.ok || (data.errors && data.errors.length > 0)) {
        setErrorMessage(data.errors?.join(" ") || data.message || "Daftar model 9router gagal dimuat.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Muat daftar model 9router gagal.";
      setErrorMessage(`Tidak dapat memuat daftar model 9router. ${message}`);
    } finally {
      setIsLoadingModels(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Status 9router</h3>
          <p className="mt-2 text-slate-300">{message}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCheckConnection}
            disabled={isChecking}
            className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isChecking ? "Sedang mengecek..." : "Cek Koneksi"}
          </button>
          <button
            type="button"
            onClick={handleLoadModels}
            disabled={isLoadingModels}
            className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 font-medium text-white transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingModels ? "Sedang memuat..." : "Muat Daftar Model"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-slate-400">Status koneksi</p>
          <p className="mt-1 font-medium text-white">{renderStatusLabel(status, initialConfigured)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-slate-400">Base URL aktif</p>
          <p className="mt-1 break-all font-medium text-white">{activeBaseUrl}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-slate-400">Root URL aktif</p>
          <p className="mt-1 break-all font-medium text-white">{rootUrl}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-slate-400">Chat model aktif</p>
          <p className="mt-1 break-all font-medium text-white">{chatModel}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 md:col-span-2">
          <p className="text-slate-400">Embedding model aktif</p>
          <p className="mt-1 break-all font-medium text-white">{embeddingModel}</p>
        </div>
      </div>

      {missingFields.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
          ENV yang belum lengkap: {missingFields.join(", ")}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">{errorMessage}</div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <h4 className="font-medium text-white">Daftar model chat</h4>
          {chatModels.length === 0 ? (
            <p className="mt-2 text-slate-400">Belum ada data model chat.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {chatModels.map((modelName) => (
                <li key={modelName} className="break-all rounded-lg border border-slate-800 px-3 py-2 text-slate-200">
                  {modelName}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <h4 className="font-medium text-white">Daftar model embedding</h4>
          {embeddingModels.length === 0 ? (
            <p className="mt-2 text-slate-400">Belum ada data model embedding.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {embeddingModels.map((modelName) => (
                <li key={modelName} className="break-all rounded-lg border border-slate-800 px-3 py-2 text-slate-200">
                  {modelName}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
