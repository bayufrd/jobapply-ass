import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsonError, jsonOk } from "@/lib/api/json-response";

function getCampaignLogPath(campaignId: string) {
  return path.join(process.cwd(), "storage", "logs", `campaign-${campaignId}.log`);
}

function parseTailParam(value: string | null) {
  const parsed = Number.parseInt(value ?? "300", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 300;
  }
  return Math.min(parsed, 1000);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tail = parseTailParam(url.searchParams.get("tail"));
  const filePath = getCampaignLogPath(id);

  try {
    const raw = await readFile(filePath, "utf8");
    const lines = raw
      .split("\n")
      .filter(Boolean)
      .slice(-tail);

    return jsonOk({
      exists: true,
      file: `storage/logs/campaign-${id}.log`,
      path: filePath,
      lines,
    });
  } catch {
    return jsonError(
      "local_log_not_found",
      "Local log campaign belum tersedia.",
      {
        exists: false,
        file: `storage/logs/campaign-${id}.log`,
        path: filePath,
        lines: [],
      },
    );
  }
}
