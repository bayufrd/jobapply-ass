import { NextResponse } from "next/server";
import { runCampaignAutopilot } from "@/lib/campaign/autopilot-runner";

const CONTROLLED_AUTOPILOT_STATUSES = new Set([
  "manual_intervention_required",
  "question_required",
  "decision_required",
  "mcp_unavailable",
  "mcp_browser_unavailable",
  "submit_unverified",
  "apply_unavailable",
  "stuck_no_progress",
  "paused",
]);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await runCampaignAutopilot(id);
  const statusCode = result.status === "error" && !CONTROLLED_AUTOPILOT_STATUSES.has(result.status) ? 500 : 200;
  return NextResponse.json(result, { status: statusCode });
}
