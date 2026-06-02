import { NextResponse } from "next/server";
import { applyAutopilotDecision } from "@/lib/campaign/autopilot-runner";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      action?: "apply" | "skip" | "skip_similar" | "ask_later";
      reason?: string;
    };

    if (!body.action) {
      return NextResponse.json({ error: "Aksi keputusan wajib diisi." }, { status: 400 });
    }

    const result = await applyAutopilotDecision(id, {
      action: body.action,
      reason: body.reason,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memproses keputusan autopilot." },
      { status: 500 },
    );
  }
}
