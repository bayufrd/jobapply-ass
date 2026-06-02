import { PlaywrightMcpClient } from "@/lib/mcp/playwright-mcp-client";

const DEFAULT_MCP_URL = "http://localhost:8931/mcp";
const MCP_TIMEOUT_MS = 3000;

export async function checkPlaywrightMcpHealth(): Promise<{
  ok: boolean;
  url: string;
  error?: string;
  message: string;
}> {
  const url = process.env.PLAYWRIGHT_MCP_URL?.trim() || DEFAULT_MCP_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);

  try {
    const client = new PlaywrightMcpClient(url);

    await Promise.race([
      client.connect(),
      new Promise((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("MCP preflight timeout")),
          { once: true },
        );
      }),
    ]);

    return {
      ok: true,
      url,
      message: "Playwright MCP aktif dan bisa diakses.",
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : "fetch failed",
      message: "Playwright MCP belum aktif atau tidak bisa diakses. Jalankan npm run mcp:playwright lalu coba lagi.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
