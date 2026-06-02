import { NextResponse } from "next/server";
import { checkPlaywrightMcpHealth } from "@/lib/mcp/mcp-health";

export async function GET() {
  const enabled = (process.env.PLAYWRIGHT_MCP_ENABLED ?? "true") === "true";
  const health = await checkPlaywrightMcpHealth();

  return NextResponse.json({
    enabled,
    url: health.url,
    connectOk: health.connectOk,
    toolsListOk: health.toolsListOk,
    navigateOk: health.navigateOk,
    snapshotOk: health.snapshotOk,
    snapshotUsable: health.snapshotUsable,
    browserDependencyOk: health.browserDependencyOk,
    staleBlankPage: health.staleBlankPage,
    currentSnapshotUrl: health.currentSnapshotUrl,
    expectedHealthMarkerFound: health.expectedHealthMarkerFound,
    retryCount: health.retryCount,
    snapshotTextPreview: health.snapshotTextPreview ?? health.rawSnapshotPreview ?? null,
    parsedElementsCount: health.snapshotUsable ? undefined : 0,
    parsedButtons: health.parsedButtons,
    ok: health.ok,
    message: health.message,
    rawError: health.error ?? null,
  });
}
