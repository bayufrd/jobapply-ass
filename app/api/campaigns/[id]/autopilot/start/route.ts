import { NextResponse } from "next/server";
import { runCampaignAutopilot } from "@/lib/campaign/autopilot-runner";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await runCampaignAutopilot(id);
  return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
}
