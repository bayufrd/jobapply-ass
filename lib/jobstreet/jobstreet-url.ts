import { normalizeSafeUrl } from "./safe-url.ts";

const JOBSTREET_BASE_URL = "https://id.jobstreet.com";

export type JobstreetApplyPathStep =
  | "apply"
  | "role-requirements"
  | "profile"
  | "review"
  | "success";

function normalizePathname(pathname: string) {
  return pathname.replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
}

export function extractJobstreetJobId(url: string): string | null {
  const normalized = normalizeSafeUrl(url, {
    defaultBaseUrl: JOBSTREET_BASE_URL,
    allowExternal: true,
  });

  if (!normalized.ok || !normalized.isJobstreet) {
    return null;
  }

  const pathname = normalizePathname(new URL(normalized.url).pathname);
  const match = pathname.match(/\/id\/job\/(\d+)(?:\/apply(?:\/(?:role-requirements|profile|review|success))?)?$/i)
    ?? pathname.match(/\/job\/(\d+)(?:\/apply(?:\/(?:role-requirements|profile|review|success))?)?$/i);

  return match?.[1] ?? null;
}

export function buildJobstreetApplyUrl(jobId: string, step: JobstreetApplyPathStep = "apply") {
  const normalizedJobId = jobId.trim();
  const suffix = step === "apply" ? "/apply" : `/apply/${step}`;
  return `${JOBSTREET_BASE_URL}/id/job/${normalizedJobId}${suffix}`;
}
