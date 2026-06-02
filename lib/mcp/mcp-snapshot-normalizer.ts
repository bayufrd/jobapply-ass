import { detectApplicationSuccessMarker } from "@/lib/browser/success-markers";
import type { McpElement, McpSnapshot } from "@/lib/mcp/playwright-mcp-client";

export type NormalizedMcpPage = {
  url: string;
  title: string;
  pageKind:
    | "job_detail"
    | "apply_form"
    | "question_step"
    | "review_step"
    | "final_submit_step"
    | "success"
    | "login_or_security"
    | "external_redirect"
    | "unknown";
  visibleTextSummary: string;
  buttons: Array<{ elementId: string; label: string; disabled?: boolean }>;
  inputs: Array<{ elementId: string; label: string; valuePreview?: string; required?: boolean }>;
  selects: Array<{ elementId: string; label: string; options: string[]; required?: boolean }>;
  checkboxes: Array<{ elementId: string; label: string; checked?: boolean }>;
  radios: Array<{ elementId: string; groupLabel: string; label: string; checked?: boolean }>;
  questions: Array<{ text: string; options?: string[] }>;
  submitCandidates: Array<{ elementId: string; label: string; confidenceHint: string }>;
};

const SECURITY_MARKERS = [
  "captcha",
  "otp",
  "one-time password",
  "verify your account",
  "verification code",
  "security check",
  "login",
  "masuk",
  "kata sandi",
  "password",
  "verifikasi",
];

const REVIEW_MARKERS = ["review your application", "review application", "tinjau lamaran", "review"];
const FINAL_SUBMIT_MARKERS = ["submit application", "kirim lamaran", "send application"];
const QUESTION_MARKERS = ["question", "pertanyaan", "why should we hire you", "cover letter", "expected salary"];
const APPLY_MARKERS = ["apply", "lamar", "quick apply"];

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function elementLabel(element: McpElement) {
  return compactText(element.name || element.text || element.role || element.elementId);
}

function isButton(element: McpElement) {
  return ["button", "link", "menuitem"].includes((element.role || "").toLowerCase())
    || /apply|submit|continue|next|review|send|kirim|lanjut/i.test(`${element.name || ""} ${element.text || ""}`);
}

function isInput(element: McpElement) {
  return ["textbox", "searchbox", "combobox", "spinbutton"].includes((element.role || "").toLowerCase())
    || element.editable === true;
}

function isCheckbox(element: McpElement) {
  return (element.role || "").toLowerCase() === "checkbox";
}

function isRadio(element: McpElement) {
  return (element.role || "").toLowerCase() === "radio";
}

function isSelect(element: McpElement) {
  return (element.role || "").toLowerCase() === "combobox" && Array.isArray(element.options) && element.options.length > 0;
}

function detectPageKind(snapshot: McpSnapshot, buttons: NormalizedMcpPage["buttons"], questions: NormalizedMcpPage["questions"], submitCandidates: NormalizedMcpPage["submitCandidates"]): NormalizedMcpPage["pageKind"] {
  const text = normalizeText(`${snapshot.title}\n${snapshot.accessibilityText}`);
  const url = normalizeText(snapshot.url);

  if (detectApplicationSuccessMarker({ url: snapshot.url, text: `${snapshot.title}\n${snapshot.accessibilityText}` }).matched) {
    return "success";
  }

  if (SECURITY_MARKERS.some((marker) => text.includes(marker))) {
    return "login_or_security";
  }

  if (url && !url.includes("jobstreet") && /^https?:\/\//.test(url)) {
    return "external_redirect";
  }

  const hasFinalSubmitLabel = submitCandidates.some((candidate) => FINAL_SUBMIT_MARKERS.some((marker) => normalizeText(candidate.label).includes(marker)));
  if (hasFinalSubmitLabel) {
    return "final_submit_step";
  }

  if (REVIEW_MARKERS.some((marker) => text.includes(marker))) {
    return "review_step";
  }

  if (questions.length > 0 || QUESTION_MARKERS.some((marker) => text.includes(marker))) {
    return "question_step";
  }

  if (buttons.some((button) => APPLY_MARKERS.some((marker) => normalizeText(button.label).includes(marker)))) {
    return "job_detail";
  }

  if (snapshot.elements.some((element) => isInput(element) || isSelect(element) || isCheckbox(element) || isRadio(element))) {
    return "apply_form";
  }

  return "unknown";
}

export function normalizeMcpSnapshot(snapshot: McpSnapshot): NormalizedMcpPage {
  const buttons = snapshot.elements
    .filter(isButton)
    .map((element) => ({
      elementId: element.elementId,
      label: elementLabel(element),
      disabled: element.disabled,
    }));

  const inputs = snapshot.elements
    .filter((element) => isInput(element) && !isSelect(element))
    .map((element) => ({
      elementId: element.elementId,
      label: elementLabel(element),
      valuePreview: element.value ? String(element.value).slice(0, 80) : undefined,
      required: element.required,
    }));

  const selects = snapshot.elements
    .filter(isSelect)
    .map((element) => ({
      elementId: element.elementId,
      label: elementLabel(element),
      options: (element.options ?? []).slice(0, 20),
      required: element.required,
    }));

  const checkboxes = snapshot.elements
    .filter(isCheckbox)
    .map((element) => ({
      elementId: element.elementId,
      label: elementLabel(element),
      checked: element.checked,
    }));

  const radios = snapshot.elements
    .filter(isRadio)
    .map((element) => ({
      elementId: element.elementId,
      groupLabel: element.role || "radio",
      label: elementLabel(element),
      checked: element.checked,
    }));

  const lines = snapshot.accessibilityText
    .split(/\n+/)
    .map(compactText)
    .filter(Boolean);

  const questions = lines
    .filter((line) => /\?|expected salary|current salary|availability|notice period|cover letter|apakah|berapa|kapan/i.test(line))
    .slice(0, 12)
    .map((text) => ({ text }));

  const submitCandidates = buttons
    .filter((button) => /submit|kirim|send/i.test(button.label))
    .map((button) => ({
      elementId: button.elementId,
      label: button.label,
      confidenceHint: /submit application|kirim lamaran|send application/i.test(button.label)
        ? "high"
        : /submit|kirim|send/i.test(button.label)
          ? "medium"
          : "low",
    }));

  return {
    url: snapshot.url,
    title: snapshot.title,
    pageKind: detectPageKind(snapshot, buttons, questions, submitCandidates),
    visibleTextSummary: lines.join(" ").slice(0, 2500),
    buttons,
    inputs,
    selects,
    checkboxes,
    radios,
    questions,
    submitCandidates,
  };
}

export function hasMcpSuccessMarker(page: NormalizedMcpPage) {
  return detectApplicationSuccessMarker({
    url: page.url,
    text: `${page.title}\n${page.visibleTextSummary}`,
  }).matched;
}
