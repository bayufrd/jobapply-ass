import { NextResponse } from "next/server";
import { getNineRouterConfig } from "@/lib/ai/9router-config";

async function fetchModels(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  const rawText = await response.text();
  let payload: unknown = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = rawText || null;
  }

  if (!response.ok) {
    throw new Error(`Request model gagal (${response.status}).`);
  }

  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) {
    throw new Error("Format daftar model 9router tidak valid.");
  }

  return payload.data
    .map((item) => {
      if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string") {
        return null;
      }

      return item.id;
    })
    .filter((item): item is string => Boolean(item));
}

export async function GET() {
  const config = getNineRouterConfig();

  if (!config.rootUrl || !config.apiKey) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Konfigurasi 9router belum lengkap. Pastikan NINEROUTER_URL dan NINEROUTER_KEY sudah diisi di file .env.",
        rootUrl: config.rootUrl || null,
        activeBaseUrl: config.apiBaseUrl || null,
        chatModels: [],
        embeddingModels: [],
        missingFields: config.missingFields,
      },
      { status: 500 },
    );
  }

  const chatUrl = `${config.apiBaseUrl}/models`;
  const embeddingUrl = `${config.apiBaseUrl}/models/embedding`;

  const [chatResult, embeddingResult] = await Promise.allSettled([
    fetchModels(chatUrl, config.apiKey),
    fetchModels(embeddingUrl, config.apiKey),
  ]);

  const chatModels = chatResult.status === "fulfilled" ? chatResult.value : [];
  const embeddingModels = embeddingResult.status === "fulfilled" ? embeddingResult.value : [];
  const errors = [
    chatResult.status === "rejected" ? `Model chat: ${chatResult.reason instanceof Error ? chatResult.reason.message : "gagal memuat."}` : null,
    embeddingResult.status === "rejected"
      ? `Model embedding: ${embeddingResult.reason instanceof Error ? embeddingResult.reason.message : "gagal memuat."}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return NextResponse.json(
    {
      success: errors.length === 0,
      message:
        errors.length === 0
          ? "Daftar model 9router berhasil dimuat."
          : "Sebagian daftar model 9router gagal dimuat.",
      rootUrl: config.rootUrl,
      activeBaseUrl: config.apiBaseUrl,
      chatModel: config.chatModel || null,
      embeddingModel: config.embeddingModel || null,
      chatModels,
      embeddingModels,
      missingFields: config.missingFields,
      errors,
    },
    { status: errors.length === 0 ? 200 : 207 },
  );
}
