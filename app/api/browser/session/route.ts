import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { PlaywrightMcpClient } from "@/lib/mcp/playwright-mcp-client";
import {
  analyzeJobstreetSessionSnapshot,
  getDefaultJobstreetSessionCheckUrl,
} from "@/lib/jobstreet/session-check";

export async function GET(request: Request) {
  const session = await prisma.browserSession.findUnique({
    where: { provider: "jobstreet" },
  });

  const { searchParams } = new URL(request.url);
  const shouldCheckLive = searchParams.get("checkLive") === "1";
  const campaignId = searchParams.get("campaignId");
  const targetUrl = searchParams.get("targetUrl") || getDefaultJobstreetSessionCheckUrl();
  const visibleMode = (process.env.PLAYWRIGHT_HEADLESS ?? "false") !== "true";

  let liveCheck: Record<string, unknown> | null = null;

  if (shouldCheckLive) {
    await writeAutomationLog({
      campaignId,
      event: "jobstreet.session_check_started",
      message: "Validasi sesi Jobstreet live via MCP dimulai.",
      metadata: {
        targetUrl,
        visibleMode,
      },
    }).catch(() => undefined);

    try {
      const client = new PlaywrightMcpClient();
      await client.connect();
      await client.navigate(targetUrl);
      const snapshot = await client.snapshot();
      const result = analyzeJobstreetSessionSnapshot(snapshot);

      liveCheck = {
        ok: true,
        targetUrl,
        mcpUrl: client.getMcpUrl(),
        diagnostics: client.getSessionDiagnostics(),
        ...result,
      };

      await writeAutomationLog({
        campaignId,
        level: result.canResumeAutopilot ? "info" : "warn",
        event: result.canResumeAutopilot ? "jobstreet.session_valid" : "jobstreet.session_invalid",
        message: result.canResumeAutopilot
          ? "Sesi Jobstreet live valid untuk melanjutkan autopilot."
          : "Sesi Jobstreet live belum valid untuk melanjutkan autopilot.",
        metadata: liveCheck,
      }).catch(() => undefined);
    } catch (error) {
      liveCheck = {
        ok: false,
        targetUrl,
        error: error instanceof Error ? error.message : "Live session check gagal.",
      };

      await writeAutomationLog({
        campaignId,
        level: "warn",
        event: "jobstreet.session_invalid",
        message: "Validasi sesi Jobstreet live via MCP gagal dijalankan.",
        metadata: liveCheck,
      }).catch(() => undefined);
    }
  }

  return NextResponse.json({
    session,
    configuredPath: process.env.PLAYWRIGHT_SESSION_PATH ?? "./storage/jobstreet.auth.json",
    visibleMode,
    liveCheck,
    message: shouldCheckLive
      ? "Validasi sesi browser Jobstreet live selesai."
      : session
        ? "Metadata sesi browser ditemukan. Tambahkan ?checkLive=1 untuk validasi live via MCP."
        : "Belum ada metadata sesi browser tersimpan. Tambahkan ?checkLive=1 untuk validasi live via MCP.",
  });
}
