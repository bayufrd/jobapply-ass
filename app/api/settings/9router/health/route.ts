import { NextResponse } from "next/server";
import { getNineRouterConfig } from "@/lib/ai/9router-config";

export async function GET() {
  const config = getNineRouterConfig();

  if (!config.rootUrl || !config.apiKey) {
    return NextResponse.json(
      {
        success: false,
        status: "belum_terkonfigurasi",
        message:
          "Konfigurasi 9router belum lengkap. Pastikan NINEROUTER_URL dan NINEROUTER_KEY sudah diisi di file .env.",
        rootUrl: config.rootUrl || null,
        activeBaseUrl: config.apiBaseUrl || null,
        chatModel: config.chatModel || null,
        embeddingModel: config.embeddingModel || null,
        missingFields: config.missingFields,
      },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(`${config.rootUrl}/api/health`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      cache: "no-store",
    });

    const rawText = await response.text();
    let healthData: unknown = null;

    try {
      healthData = rawText ? JSON.parse(rawText) : null;
    } catch {
      healthData = rawText || null;
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          status: "gagal",
          message: `Koneksi ke health check 9router gagal dengan status ${response.status}.`,
          rootUrl: config.rootUrl,
          activeBaseUrl: config.apiBaseUrl,
          chatModel: config.chatModel || null,
          embeddingModel: config.embeddingModel || null,
          missingFields: config.missingFields,
          health: healthData,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      status: "terhubung",
      message: "Koneksi 9router berhasil.",
      rootUrl: config.rootUrl,
      activeBaseUrl: config.apiBaseUrl,
      chatModel: config.chatModel || null,
      embeddingModel: config.embeddingModel || null,
      missingFields: config.missingFields,
      health: healthData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check 9router gagal.";

    return NextResponse.json(
      {
        success: false,
        status: "error",
        message: `Tidak dapat menghubungi 9router. ${message}`,
        rootUrl: config.rootUrl,
        activeBaseUrl: config.apiBaseUrl,
        chatModel: config.chatModel || null,
        embeddingModel: config.embeddingModel || null,
        missingFields: config.missingFields,
      },
      { status: 502 },
    );
  }
}
