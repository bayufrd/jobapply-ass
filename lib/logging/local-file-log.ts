import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const LOG_DIR = path.join(process.cwd(), "storage", "logs");
const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "cookie",
  "apikey",
  "authorization",
  "session",
  "accesstoken",
  "refreshtoken",
]);

type LocalLogLevel = "debug" | "info" | "warn" | "error";

type AppendLocalLogInput = {
  campaignId?: string | null;
  jobListingId?: string | null;
  applicationId?: string | null;
  level?: LocalLogLevel;
  event: string;
  message: string;
  metadata?: unknown;
};

function maskSensitiveValue(value: unknown): string {
  if (typeof value === "string") {
    return value.length <= 8 ? "[masked]" : `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return "[masked]";
  }

  return "[masked]";
}

function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      return [key, maskSensitiveValue(entryValue)] satisfies [string, unknown];
    }

    return [key, sanitizeForLog(entryValue)] satisfies [string, unknown];
  });

  return Object.fromEntries(entries);
}

function buildLogLine(input: AppendLocalLogInput) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level: input.level ?? "info",
    campaignId: input.campaignId ?? null,
    jobListingId: input.jobListingId ?? null,
    applicationId: input.applicationId ?? null,
    event: input.event,
    message: input.message,
    metadata: input.metadata === undefined ? null : sanitizeForLog(input.metadata),
  });
}

function getDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function isMcpEvent(event: string) {
  return event.startsWith("mcp.") || event.startsWith("mcp_ai.");
}

function getTargetFiles(input: Pick<AppendLocalLogInput, "campaignId" | "event">) {
  const dateKey = getDateKey();
  const targets = [path.join(LOG_DIR, `app-${dateKey}.log`)];

  if (isMcpEvent(input.event)) {
    targets.push(path.join(LOG_DIR, `mcp-${dateKey}.log`));
  }

  if (input.campaignId) {
    targets.unshift(path.join(LOG_DIR, `campaign-${input.campaignId}.log`));
  }

  return targets;
}

export async function appendLocalLog(input: AppendLocalLogInput): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
  const line = `${buildLogLine(input)}\n`;
  const targets = getTargetFiles({ campaignId: input.campaignId, event: input.event });

  await Promise.all(targets.map((filePath) => appendFile(filePath, line, "utf8")));
}
