import { NextResponse } from "next/server";
import { PlaywrightMcpClient } from "@/lib/mcp/playwright-mcp-client";
import { analyzeJobstreetSessionSnapshot } from "@/lib/jobstreet/session-check";

export async function GET() {
  try {
    const client = new PlaywrightMcpClient();
    await client.connect();
    const snapshot = await client.snapshot();
    const analysis = analyzeJobstreetSessionSnapshot(snapshot);
    
    return NextResponse.json({
      ok: true,
      url: snapshot.url,
      title: snapshot.title,
      analysis,
      elements: snapshot.elements.map(e => ({
        id: e.elementId,
        role: e.role,
        name: e.name,
        text: e.text,
        disabled: e.disabled
      })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Debug wizard failed"
    }, { status: 500 });
  }
}
