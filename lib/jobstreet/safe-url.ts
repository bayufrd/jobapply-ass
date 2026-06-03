const DEFAULT_JOBSTREET_BASE_URL = "https://id.jobstreet.com";

const JOBSTREET_HOSTNAMES = new Set([
  "id.jobstreet.com",
  "www.jobstreet.co.id",
  "jobstreet.co.id",
  "www.jobsdb.com",
  "id.jobsdb.com",
]);

const BLOCKED_PROTOCOLS = new Set(["javascript:", "mailto:", "tel:", "data:", "blob:"]);

export type SafeUrlResult =
  | {
      ok: true;
      url: string;
      origin: string;
      hostname: string;
      isJobstreet: boolean;
      isExternal: boolean;
      reason?: never;
    }
  | {
      ok: false;
      url?: never;
      origin?: never;
      hostname?: never;
      isJobstreet?: never;
      isExternal?: never;
      reason:
        | "empty_url"
        | "invalid_url"
        | "blocked_protocol"
        | "unsupported_type";
      inputPreview: string;
    };

function createInputPreview(input: unknown) {
  if (typeof input !== "string") {
    return String(input).slice(0, 120);
  }

  return input.trim().slice(0, 120);
}

function isJobstreetHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (JOBSTREET_HOSTNAMES.has(normalized)) {
    return true;
  }

  return normalized.endsWith(".jobstreet.com") || normalized.endsWith(".jobstreet.co.id") || normalized.endsWith(".jobsdb.com");
}

function getBaseUrl(options?: { baseUrl?: string; defaultBaseUrl?: string }) {
  const rawBase = options?.baseUrl?.trim() || options?.defaultBaseUrl?.trim() || DEFAULT_JOBSTREET_BASE_URL;

  try {
    const parsedBase = new URL(rawBase);
    if (!/^https?:$/i.test(parsedBase.protocol)) {
      return DEFAULT_JOBSTREET_BASE_URL;
    }
    return parsedBase.toString();
  } catch {
    return DEFAULT_JOBSTREET_BASE_URL;
  }
}

export function normalizeSafeUrl(
  input: unknown,
  options?: {
    baseUrl?: string;
    defaultBaseUrl?: string;
    allowExternal?: boolean;
  },
): SafeUrlResult {
  if (typeof input !== "string") {
    return {
      ok: false,
      reason: "unsupported_type",
      inputPreview: createInputPreview(input),
    };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: "empty_url",
      inputPreview: "",
    };
  }

  if (trimmed === "#") {
    return {
      ok: false,
      reason: "blocked_protocol",
      inputPreview: trimmed,
    };
  }

  const lowerTrimmed = trimmed.toLowerCase();
  if (BLOCKED_PROTOCOLS.has(lowerTrimmed.split(/[/?#]/, 1)[0] + (lowerTrimmed.includes(":") ? ":" : ""))) {
    return {
      ok: false,
      reason: "blocked_protocol",
      inputPreview: createInputPreview(trimmed),
    };
  }

  const baseUrl = getBaseUrl(options);
  let parsed: URL;

  try {
    const shouldResolveRelative = /^\//.test(trimmed);
    parsed = shouldResolveRelative ? new URL(trimmed, baseUrl) : new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "invalid_url",
      inputPreview: createInputPreview(trimmed),
    };
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    return {
      ok: false,
      reason: "blocked_protocol",
      inputPreview: createInputPreview(trimmed),
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isJobstreet = isJobstreetHostname(hostname);
  const isExternal = !isJobstreet;

  if (isExternal && options?.allowExternal !== true) {
    return {
      ok: false,
      reason: "invalid_url",
      inputPreview: createInputPreview(trimmed),
    };
  }

  return {
    ok: true,
    url: parsed.toString(),
    origin: parsed.origin,
    hostname,
    isJobstreet,
    isExternal,
  };
}
