import { detectApplicationSuccessMarker } from "./success-markers.ts";
import { extractJobstreetJobId, type JobstreetApplyPathStep } from "../jobstreet/jobstreet-url.ts";

export type JobstreetApplyStep = JobstreetApplyPathStep | "external_redirect" | "manual_intervention" | "unknown";

function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

export function isNormalJobstreetApplyUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = normalizePathname(parsedUrl.pathname);

    if (!hostname.includes("jobstreet") && !hostname.includes("jobsdb")) {
      return false;
    }

    if (!extractJobstreetJobId(url)) {
      return false;
    }

    return [
      /\/job\/\d+\/apply$/,
      /\/job\/\d+\/apply\/role-requirements$/,
      /\/job\/\d+\/apply\/profile$/,
      /\/job\/\d+\/apply\/review$/,
      /\/job\/\d+\/apply\/success$/,
      /\/id\/job\/\d+\/apply$/,
      /\/id\/job\/\d+\/apply\/role-requirements$/,
      /\/id\/job\/\d+\/apply\/profile$/,
      /\/id\/job\/\d+\/apply\/review$/,
      /\/id\/job\/\d+\/apply\/success$/,
    ].some((pattern) => pattern.test(pathname));
  } catch {
    return false;
  }
}

export function detectJobstreetApplyStep(url: string, pageText?: string): JobstreetApplyStep {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return "unknown";
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const pathname = normalizePathname(parsedUrl.pathname);

  if (!hostname.includes("jobstreet") && !hostname.includes("jobsdb")) {
    return "external_redirect";
  }

  if (detectApplicationSuccessMarker({ url, text: pageText }).matched) {
    return "success";
  }

  if (/\/(id\/)?job\/\d+\/apply\/review$/i.test(pathname)) {
    return "review";
  }

  if (/\/(id\/)?job\/\d+\/apply\/profile$/i.test(pathname)) {
    return "profile";
  }

  if (/\/(id\/)?job\/\d+\/apply\/role-requirements$/i.test(pathname)) {
    return "role-requirements";
  }

  if (/\/(id\/)?job\/\d+\/apply$/i.test(pathname)) {
    return "apply";
  }

  return "unknown";
}
