import type { McpAiActionPlan } from "@/lib/ai/mcp-ui-action-planner";
import type { NormalizedMcpPage } from "@/lib/mcp/mcp-snapshot-normalizer";
import type { McpSnapshot, PlaywrightMcpClient } from "@/lib/mcp/playwright-mcp-client";

export type McpExecutionResult = {
  executed: boolean;
  snapshot: McpSnapshot;
  noProgress: boolean;
  blockedReason?: string;
  lastAction?: McpAiActionPlan["actions"][number];
};

const SENSITIVE_LABEL_PATTERNS = [/password/i, /captcha/i, /otp/i, /login/i, /security/i, /verification/i];
const HIGH_CONFIDENCE_SUBMIT_PATTERNS = [/submit application/i, /kirim lamaran/i, /send application/i, /^submit$/i];

function fingerprintSnapshot(snapshot: McpSnapshot) {
  return JSON.stringify({
    url: snapshot.url,
    title: snapshot.title,
    text: snapshot.accessibilityText.slice(0, 4000),
    elements: snapshot.elements.map((element) => ({
      elementId: element.elementId,
      role: element.role,
      name: element.name,
      text: element.text,
      checked: element.checked,
      disabled: element.disabled,
      selected: element.selected,
    })),
  });
}

function getElementLabel(page: NormalizedMcpPage, elementId: string) {
  return [
    ...page.buttons,
    ...page.inputs,
    ...page.selects,
    ...page.checkboxes,
    ...page.radios.map((item) => ({ elementId: item.elementId, label: item.label })),
    ...page.submitCandidates.map((item) => ({ elementId: item.elementId, label: item.label })),
  ].find((item) => item.elementId === elementId)?.label;
}

function getElementDescriptor(page: NormalizedMcpPage, elementId: string) {
  return getElementLabel(page, elementId) || elementId;
}

function isSensitiveLabel(label: string | undefined) {
  return label ? SENSITIVE_LABEL_PATTERNS.some((pattern) => pattern.test(label)) : false;
}

function hasRequiredVisibleInputs(page: NormalizedMcpPage) {
  return page.inputs.some((input) => input.required && !input.valuePreview);
}

export async function executeMcpActionPlan({
  client,
  plan,
  page,
  previousSnapshot,
}: {
  client: PlaywrightMcpClient;
  plan: McpAiActionPlan;
  page: NormalizedMcpPage;
  previousSnapshot: McpSnapshot;
}): Promise<McpExecutionResult> {
  const latestSnapshot = await client.snapshot();
  const latestFingerprint = fingerprintSnapshot(latestSnapshot);
  const previousFingerprint = fingerprintSnapshot(previousSnapshot);

  if (!plan.safeToExecute) {
    return {
      executed: false,
      snapshot: latestSnapshot,
      noProgress: latestFingerprint === previousFingerprint,
      blockedReason: "Rencana AI ditandai tidak aman untuk dieksekusi.",
    };
  }

  const firstAction = plan.actions[0];
  if (!firstAction) {
    return {
      executed: false,
      snapshot: latestSnapshot,
      noProgress: latestFingerprint === previousFingerprint,
      blockedReason: "Tidak ada aksi MCP yang dapat dijalankan.",
    };
  }

  const target = latestSnapshot.elements.find((element) => element.elementId === firstAction.elementId);
  if (!target) {
    return {
      executed: false,
      snapshot: latestSnapshot,
      noProgress: latestFingerprint === previousFingerprint,
      blockedReason: "Elemen target tidak ditemukan pada snapshot MCP terbaru.",
      lastAction: firstAction,
    };
  }

  const label = getElementLabel(page, firstAction.elementId) || target.name || target.text || "";
  if (isSensitiveLabel(label)) {
    return {
      executed: false,
      snapshot: latestSnapshot,
      noProgress: latestFingerprint === previousFingerprint,
      blockedReason: "Elemen sensitif diblokir oleh safety gate MCP.",
      lastAction: firstAction,
    };
  }

  if (plan.goal === "final_submit") {
    if (!plan.safeToSubmit || plan.confidence < 0.9) {
      return {
        executed: false,
        snapshot: latestSnapshot,
        noProgress: latestFingerprint === previousFingerprint,
        blockedReason: "Submit akhir diblokir karena confidence atau safeToSubmit belum memenuhi syarat.",
        lastAction: firstAction,
      };
    }

    if (!HIGH_CONFIDENCE_SUBMIT_PATTERNS.some((pattern) => pattern.test(label))) {
      return {
        executed: false,
        snapshot: latestSnapshot,
        noProgress: latestFingerprint === previousFingerprint,
        blockedReason: "Label submit akhir belum cukup kuat untuk dieksekusi.",
        lastAction: firstAction,
      };
    }

    if (hasRequiredVisibleInputs(page)) {
      return {
        executed: false,
        snapshot: latestSnapshot,
        noProgress: latestFingerprint === previousFingerprint,
        blockedReason: "Masih ada field wajib yang terlihat kosong.",
        lastAction: firstAction,
      };
    }
  }

  const descriptor = getElementDescriptor(page, firstAction.elementId);

  switch (firstAction.type) {
    case "click":
      await client.click(firstAction.elementId, descriptor);
      break;
    case "fill":
      await client.fill(firstAction.elementId, firstAction.value, descriptor);
      break;
    case "select":
      await client.select(firstAction.elementId, firstAction.value, descriptor);
      break;
    case "check":
      await client.check(firstAction.elementId, firstAction.checked, descriptor);
      break;
  }

  const nextSnapshot = await client.waitForChange(previousSnapshot, 10_000);
  const nextFingerprint = fingerprintSnapshot(nextSnapshot);

  return {
    executed: true,
    snapshot: nextSnapshot,
    noProgress: nextFingerprint === previousFingerprint,
    lastAction: firstAction,
  };
}
