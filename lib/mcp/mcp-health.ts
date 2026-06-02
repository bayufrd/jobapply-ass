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
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "jobapply-ass-preflight",
            version: "0.1.0",
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        url,
        error: `HTTP ${response.status}`,
        message: "Playwright MCP belum aktif atau tidak bisa diakses. Jalankan npm run mcp:playwright lalu coba lagi.",
      };
    }

    const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (data?.error?.message) {
      return {
        ok: false,
        url,
        error: data.error.message,
        message: "Playwright MCP belum aktif atau tidak bisa diakses. Jalankan npm run mcp:playwright lalu coba lagi.",
      };
    }

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
