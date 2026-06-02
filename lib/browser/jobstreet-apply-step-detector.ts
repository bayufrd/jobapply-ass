export type JobstreetApplyStep =
  | "choose_documents"
  | "employer_questions"
  | "update_profile"
  | "review_submit"
  | "success"
  | "external_redirect"
  | "manual_intervention"
  | "unknown";

const SUCCESS_MARKERS = [
  "nice work",
  "your application has been sent",
  "application sent",
  "lamaran berhasil dikirim",
  "lamaran terkirim",
  "terima kasih telah melamar",
];

export function isNormalJobstreetApplyUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

    if (!hostname.includes("jobstreet") && !hostname.includes("jobsdb")) {
      return false;
    }

    return [
      /\/job\/\d+\/apply$/,
      /\/job\/\d+\/apply\/role-requirements$/,
      /\/job\/\d+\/apply\/profile$/,
      /\/job\/\d+\/apply\/review$/,
      /\/job\/\d+\/apply\/success$/,
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
  const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";
  const normalizedPageText = pageText?.toLowerCase() ?? "";

  if (!hostname.includes("jobstreet") && !hostname.includes("jobsdb")) {
    return "external_redirect";
  }

  if (/\/job\/\d+\/apply\/success$/.test(pathname)) {
    return "success";
  }

  if (/\/job\/\d+\/apply\/review$/.test(pathname)) {
    return "review_submit";
  }

  if (/\/job\/\d+\/apply\/profile$/.test(pathname)) {
    return "update_profile";
  }

  if (/\/job\/\d+\/apply\/role-requirements$/.test(pathname)) {
    return "employer_questions";
  }

  if (/\/job\/\d+\/apply$/.test(pathname)) {
    return "choose_documents";
  }

  if (SUCCESS_MARKERS.some((marker) => normalizedPageText.includes(marker))) {
    return "success";
  }

  return "unknown";
}
