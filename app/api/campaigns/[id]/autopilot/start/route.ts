import { runCampaignAutopilot } from "@/lib/campaign/autopilot-runner";
import { jsonControlled, jsonError, jsonOk } from "@/lib/api/json-response";

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
  if (result.status === "error") {
    return jsonError("autopilot_start_failed", result.message, result, { status: 500 });
  }
  if (CONTROLLED_AUTOPILOT_STATUSES.has(result.status)) {
    return jsonControlled(result);
  }
  return jsonOk(result);
}
