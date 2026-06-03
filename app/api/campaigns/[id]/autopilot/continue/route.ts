import { runCampaignAutopilot } from "@/lib/campaign/autopilot-runner";
import { jsonControlled, jsonError, jsonOk } from "@/lib/api/json-response";
import { writeAutomationLog } from "@/lib/logging/automation-log";

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
  "completed",
  "search_continue",
  "safe_continue",
  "skipped_continue",
  "submitted_continue",
]);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await runCampaignAutopilot(id);
    if (result.status === "error") {
      return jsonError("autopilot_continue_failed", result.message, {
        ...result,
        status: "error",
        currentStep: result.currentStep ?? "autopilot_continue_failed",
        canContinue: true,
      });
    }
    if (CONTROLLED_AUTOPILOT_STATUSES.has(result.status)) {
      return jsonControlled(result);
    }
    return jsonOk(result);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Autopilot gagal dilanjutkan.";
    await writeAutomationLog({
      campaignId: id,
      level: "error",
      event: "autopilot_continue_failed",
      message: details,
      metadata: { currentStep: "autopilot_continue_failed" },
    });
    return jsonError(
      "autopilot_continue_failed",
      "Autopilot gagal dilanjutkan. Cek log server untuk detail.",
      {
        status: "error",
        currentStep: "autopilot_continue_failed",
        details,
        canContinue: true,
      },
    );
  }
}
