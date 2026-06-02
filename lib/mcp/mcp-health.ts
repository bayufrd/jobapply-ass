import {
  getMcpSnapshotPreview,
  PlaywrightMcpClient,
  validateMcpSnapshot,
} from "@/lib/mcp/playwright-mcp-client";

const DEFAULT_MCP_URL = "http://localhost:8931/mcp";
const MCP_TIMEOUT_MS = 8000;
const HEALTHCHECK_DATA_URL = "data:text/html,<html><body><main><h1>MCP health check</h1><button>OK</button></main></body></html>";
const BROWSER_DEPENDENCY_MESSAGE = "Browser Playwright belum siap. Jalankan npx playwright install chromium.";
const STALE_BLANK_PAGE_MESSAGE = "MCP aktif, tetapi snapshot masih about:blank/kosong.";
const MCP_UNAVAILABLE_MESSAGE = "Playwright MCP belum aktif atau tidak bisa diakses. Jalankan npm run mcp:playwright lalu coba lagi.";
const BROWSER_DEPENDENCY_PATTERNS = [
  /browser executable doesn't exist/i,
  /chromium/i,
  /chrome/i,
  /playwright install/i,
  /executable doesn't exist/i,
];

type PlaywrightMcpHealthResult = {
  ok: boolean;
  url: string;
  connectOk: boolean;
  toolsListOk: boolean;
  navigateOk: boolean;
  snapshotOk: boolean;
  snapshotUsable: boolean;
  browserDependencyOk: boolean;
  staleBlankPage: boolean;
  currentSnapshotUrl: string | null;
  expectedHealthMarkerFound: boolean;
  retryCount: number;
  rawSnapshotPreview?: string;
  snapshotTextPreview?: string;
  parsedButtons: string[];
  error?: string;
  message: string;
};

function containsBrowserDependencyError(value: string) {
  return BROWSER_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(value));
}

function parseButtonNames(text: string) {
  const matches = [...text.matchAll(/button\s+"([^"]+)"/gi)];
  return matches.map((match) => match[1]?.trim()).filter(Boolean);
}

function isAboutBlankSnapshot(snapshotText: string, snapshotUrl: string | null) {
  if ((snapshotUrl || "").trim().toLowerCase() === "about:blank") {
    return true;
  }

  return /page url:\s*about:blank/i.test(snapshotText);
}

function hasExpectedHealthMarker(snapshotText: string, parsedButtons: string[]) {
  return /mcp health check/i.test(snapshotText)
    || /button\s+"ok"/i.test(snapshotText)
    || parsedButtons.some((button) => /^ok$/i.test(button));
}

async function captureHealthSnapshot(client: PlaywrightMcpClient) {
  const snapshot = await client.snapshot();
  const rawSnapshotPreview = getMcpSnapshotPreview(snapshot).rawTextPreview;
  const snapshotText = `${snapshot.accessibilityText}\n${snapshot.rawText}`.trim();
  const snapshotTextPreview = snapshotText.slice(0, 1000);
  const parsedButtons = parseButtonNames(snapshotText);
  const expectedHealthMarkerFound = hasExpectedHealthMarker(snapshotText, parsedButtons);
  const staleBlankPage = isAboutBlankSnapshot(snapshotText, snapshot.url || null);

  return {
    snapshot,
    rawSnapshotPreview,
    snapshotTextPreview,
    parsedButtons,
    expectedHealthMarkerFound,
    staleBlankPage,
  };
}

export async function checkPlaywrightMcpHealth(): Promise<PlaywrightMcpHealthResult> {
  const url = process.env.PLAYWRIGHT_MCP_URL?.trim() || DEFAULT_MCP_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);

  const result: PlaywrightMcpHealthResult = {
    ok: false,
    url,
    connectOk: false,
    toolsListOk: false,
    navigateOk: false,
    snapshotOk: false,
    snapshotUsable: false,
    browserDependencyOk: true,
    staleBlankPage: false,
    currentSnapshotUrl: null,
    expectedHealthMarkerFound: false,
    retryCount: 0,
    parsedButtons: [],
    message: MCP_UNAVAILABLE_MESSAGE,
  };

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
    result.connectOk = true;

    await client.listTools();
    result.toolsListOk = true;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      result.retryCount = attempt;
      await client.navigate(HEALTHCHECK_DATA_URL);
      result.navigateOk = true;
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1000));

      const captured = await captureHealthSnapshot(client);
      result.snapshotOk = true;
      result.rawSnapshotPreview = captured.rawSnapshotPreview;
      result.snapshotTextPreview = captured.snapshotTextPreview;
      result.parsedButtons = captured.parsedButtons;
      result.currentSnapshotUrl = captured.snapshot.url || null;
      result.expectedHealthMarkerFound = captured.expectedHealthMarkerFound;
      result.staleBlankPage = captured.staleBlankPage;

      const validation = validateMcpSnapshot(captured.snapshot);
      if (!validation.ok) {
        result.browserDependencyOk = validation.reason !== "browser_dependency_error";
        result.error = validation.message;
        result.message = validation.message;
        if (validation.reason === "browser_dependency_error") {
          return result;
        }
      }

      if (!captured.staleBlankPage && captured.expectedHealthMarkerFound) {
        result.snapshotUsable = true;
        result.ok = true;
        result.message = "Playwright MCP aktif dan snapshot browser siap dipakai.";
        return result;
      }
    }

    result.snapshotUsable = false;
    result.ok = false;
    result.browserDependencyOk = true;
    result.staleBlankPage = result.staleBlankPage || isAboutBlankSnapshot(result.snapshotTextPreview || "", result.currentSnapshotUrl);
    result.error = result.staleBlankPage
      ? "mcp_stale_or_empty_page"
      : "Snapshot MCP health check tidak memuat marker halaman lokal yang diharapkan.";
    result.message = result.staleBlankPage
      ? STALE_BLANK_PAGE_MESSAGE
      : "Snapshot MCP kosong/tidak valid. Automasi dihentikan sebelum AI planner agar tidak salah aksi.";
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    const browserDependencyError = containsBrowserDependencyError(message);

    result.browserDependencyOk = !browserDependencyError;
    result.error = browserDependencyError ? BROWSER_DEPENDENCY_MESSAGE : message;
    result.message = browserDependencyError ? BROWSER_DEPENDENCY_MESSAGE : MCP_UNAVAILABLE_MESSAGE;
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
