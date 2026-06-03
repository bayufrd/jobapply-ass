import { applyAutopilotDecision } from "@/lib/campaign/autopilot-runner";
import { jsonError, jsonOk } from "@/lib/api/json-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      action?: "apply" | "skip" | "skip_similar" | "ask_later" | "accept" | "reject" | "yes" | "no" | "edit_answer";
      reason?: string;
    };

    if (!body.action) {
      return jsonError("decision_action_required", "Aksi keputusan wajib diisi.", undefined, { status: 400 });
    }

    const result = await applyAutopilotDecision(id, {
      action: body.action,
      reason: body.reason,
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(
      "autopilot_decision_failed",
      error instanceof Error ? error.message : "Gagal memproses keputusan autopilot.",
      undefined,
      { status: 500 },
    );
  }
}
