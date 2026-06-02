import { prisma } from "@/lib/db/prisma";
import { checkPlaywrightMcpHealth } from "@/lib/mcp/mcp-health";
import { PlaywrightMcpClient } from "@/lib/mcp/playwright-mcp-client";

export type AppliedJobsCountResult = {
  ok: boolean;
  count: number | null;
  url: string;
  rawTextPreview?: string;
  message: string;
};

export async function getJobstreetAppliedJobsCountWithMcp(): Promise<AppliedJobsCountResult> {
  const url = "https://id.jobstreet.com/id/my-activity/applied-jobs";
  
  try {
    const health = await checkPlaywrightMcpHealth();
    if (!health.ok) {
      return {
        ok: false,
        count: null,
        url,
        message: "Playwright MCP belum aktif atau browser belum siap.",
      };
    }

    const client = new PlaywrightMcpClient();
    await client.connect();
    
    await client.navigate(url);
    // Wait for content to load
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    const snapshot = await client.snapshot();
    const text = snapshot.accessibilityText || snapshot.rawText || "";
    
    // Check for login/security
    const lowerText = text.toLowerCase();
    if (
      lowerText.includes("login") || 
      lowerText.includes("captcha") || 
      lowerText.includes("otp") || 
      lowerText.includes("verifikasi") || 
      lowerText.includes("security")
    ) {
      return {
        ok: false,
        count: null,
        url,
        rawTextPreview: text.slice(0, 500),
        message: "Butuh login/verifikasi Jobstreet untuk membaca total lamaran.",
      };
    }

    // Parsing rules: Cari pattern "98 lowongan"
    const matches = [...text.matchAll(/(\d+)\s+lowongan/gi)];
    if (matches.length > 0) {
      // Prioritaskan angka yang paling dekat dengan label halaman Applied Jobs / Dilamar
      // Untuk saat ini ambil yang pertama ditemukan yang valid
      const count = parseInt(matches[0][1], 10);
      return {
        ok: true,
        count,
        url,
        message: "Total lamaran Jobstreet berhasil dibaca.",
      };
    }

    return {
      ok: false,
      count: null,
      url,
      rawTextPreview: text.slice(0, 500),
      message: "Tidak bisa menemukan jumlah lamaran di halaman. Pastikan format halaman benar.",
    };
  } catch (error) {
    return {
      ok: false,
      count: null,
      url,
      message: error instanceof Error ? error.message : "Terjadi kesalahan saat membaca total lamaran.",
    };
  }
}
