import { NextResponse } from "next/server";
import { PlaywrightMcpClient, PlaywrightMcpError } from "@/lib/mcp/playwright-mcp-client";

function buildErrorMessage(error: unknown) {
  if (error instanceof PlaywrightMcpError) {
    return [error.message, error.causeMessage, error.responseBodyPreview]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join(" | ");
  }

  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  const enabled = (process.env.PLAYWRIGHT_MCP_ENABLED ?? "true") === "true";
  const client = new PlaywrightMcpClient(process.env.PLAYWRIGHT_MCP_URL);
  const url = client.getMcpUrl();

  const result: {
    enabled: boolean;
    url: string;
    initializeOk: boolean;
    sessionIdReceived: boolean;
    protocolVersion: string | null;
    toolsListOk: boolean;
    snapshotOk: boolean;
    lastError?: string;
  } = {
    enabled,
    url,
    initializeOk: false,
    sessionIdReceived: false,
    protocolVersion: null,
    toolsListOk: false,
    snapshotOk: false,
  };

  if (!enabled) {
    result.lastError = "Playwright MCP dinonaktifkan lewat PLAYWRIGHT_MCP_ENABLED.";
    return NextResponse.json(result);
  }

  try {
    await client.connect();
    const diagnostics = client.getSessionDiagnostics();
    result.initializeOk = true;
    result.sessionIdReceived = diagnostics.sessionIdReceived;
    result.protocolVersion = diagnostics.protocolVersion;
  } catch (error) {
    result.lastError = buildErrorMessage(error);
    return NextResponse.json(result, { status: 200 });
  }

  try {
    await client.listTools();
    result.toolsListOk = true;
  } catch (error) {
    result.lastError = buildErrorMessage(error);
    return NextResponse.json(result, { status: 200 });
  }

  try {
    await client.snapshot();
    result.snapshotOk = true;
  } catch (error) {
    result.lastError = buildErrorMessage(error);
  }

  return NextResponse.json(result);
}
