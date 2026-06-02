export class PlaywrightMcpError extends Error {
  stage: string;
  mcpUrl: string;
  toolName?: string;
  causeMessage?: string;
  responseBodyPreview?: string;
  metadata?: Record<string, unknown>;

  constructor(input: {
    message: string;
    stage: string;
    mcpUrl: string;
    toolName?: string;
    causeMessage?: string;
    responseBodyPreview?: string;
    metadata?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "PlaywrightMcpError";
    this.stage = input.stage;
    this.mcpUrl = input.mcpUrl;
    this.toolName = input.toolName;
    this.causeMessage = input.causeMessage;
    this.responseBodyPreview = input.responseBodyPreview;
    this.metadata = input.metadata;
  }
}

type McpToolResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  [key: string]: unknown;
};

export type McpElement = {
  elementId: string;
  role?: string;
  name?: string;
  text?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  selected?: boolean;
  editable?: boolean;
  required?: boolean;
  options?: string[];
};

export type McpSnapshot = {
  url: string;
  title: string;
  accessibilityText: string;
  elements: McpElement[];
  rawText: string;
  raw?: unknown;
};

export type McpSnapshotValidation = {
  ok: boolean;
  reason?: "empty_snapshot" | "browser_dependency_error" | "no_accessibility_tree" | "unknown";
  message: string;
};

type McpJsonRpcError = {
  code?: number;
  message?: string;
  data?: unknown;
};

type McpCallToolResponse = {
  id?: string | number | null;
  result?: McpToolResponse;
  error?: McpJsonRpcError;
};

type McpInitializeResponse = {
  id?: string | number | null;
  result?: {
    protocolVersion?: string;
    serverInfo?: {
      name?: string;
      version?: string;
    };
  };
  error?: McpJsonRpcError;
};

type SnapshotPayload = {
  url?: string;
  title?: string;
  accessibilityText?: string;
  text?: string;
  elements?: unknown[];
  nodes?: unknown[];
  raw?: unknown;
};

type ParsedMcpHttpResponse = {
  data: unknown;
  rawText?: string;
  contentType: string;
};

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function pickString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function pickBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function sanitizeElement(raw: unknown, index: number): McpElement | null {
  const item = asObject(raw);
  if (!item) return null;

  const elementId = pickString(item.elementId, pickString(item.id, `mcp-${index + 1}`)).trim();
  if (!elementId) return null;

  const optionsRaw = Array.isArray(item.options) ? item.options : [];

  return {
    elementId,
    role: pickString(item.role) || undefined,
    name: pickString(item.name) || undefined,
    text: pickString(item.text) || undefined,
    value: undefined,
    checked: pickBoolean(item.checked),
    disabled: pickBoolean(item.disabled),
    selected: pickBoolean(item.selected),
    editable: pickBoolean(item.editable),
    required: pickBoolean(item.required),
    options: optionsRaw.map((option) => {
      if (typeof option === "string") return option;
      const record = asObject(option);
      return record ? pickString(record.label, pickString(record.name, pickString(record.value, ""))) : "";
    }).filter(Boolean),
  };
}

function extractTextBlocks(payload: unknown): string[] {
  if (typeof payload === "string") {
    return [payload];
  }

  if (Array.isArray(payload)) {
    return payload.flatMap((item) => extractTextBlocks(item));
  }

  const record = asObject(payload);
  if (!record) return [];

  return Object.values(record).flatMap((value) => extractTextBlocks(value));
}

const MCP_BROWSER_DEPENDENCY_PATTERNS = [
  /chromium/i,
  /chrome/i,
  /browser not found/i,
  /executable doesn't exist/i,
  /playwright install/i,
  /install/i,
];

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength = 1000) {
  return compactWhitespace(value).slice(0, maxLength);
}

function extractRawText(raw: unknown) {
  return extractTextBlocks(raw).join("\n").slice(0, 20000);
}

function containsBrowserDependencyError(value: string) {
  const text = compactWhitespace(value);
  return MCP_BROWSER_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(text));
}

function parseTextSnapshotElements(text: string): McpElement[] {
  const lines = text.split(/\r?\n/);
  const elements: McpElement[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^[-*]?\s*([a-z][a-z0-9_ -]+?)\s+"([^"]+)"(?:\s+\[ref=(e[\w-]+)\])?/i);
    if (!match) continue;

    const [, rawRole, rawName, rawRef] = match;
    const role = compactWhitespace(rawRole).toLowerCase();
    const name = compactWhitespace(rawName);
    const elementId = rawRef || `mcp-text-${elements.length + 1}`;

    elements.push({
      elementId,
      role,
      name,
      text: name,
    });
  }

  return elements;
}

function extractUrlFromText(text: string) {
  const urlMatch = text.match(/\bhttps?:\/\/[^\s)\]]+/i)
    || text.match(/\burl\s*[:=]\s*([^\s]+)/i);
  return urlMatch?.[1] ?? urlMatch?.[0] ?? "";
}

function extractTitleFromText(text: string) {
  const titleMatch = text.match(/\btitle\s*[:=]\s*(.+)/i);
  return compactWhitespace(titleMatch?.[1] ?? "");
}

function normalizeSnapshotPayload(raw: unknown): McpSnapshot {
  const payload = (asObject(raw) ?? {}) as SnapshotPayload;
  const elementsSource = Array.isArray(payload.elements)
    ? payload.elements
    : Array.isArray(payload.nodes)
      ? payload.nodes
      : [];

  const rawText = extractRawText(raw);
  const accessibilityText = pickString(payload.accessibilityText)
    || pickString(payload.text)
    || rawText;
  const parsedElements = elementsSource.map(sanitizeElement).filter((item): item is McpElement => Boolean(item));
  const fallbackTextElements = parsedElements.length === 0 ? parseTextSnapshotElements(accessibilityText || rawText) : [];
  const elements = parsedElements.length > 0 ? parsedElements : fallbackTextElements;
  const normalizedUrl = pickString(payload.url).trim() || extractUrlFromText(accessibilityText || rawText);
  const normalizedTitle = pickString(payload.title).trim() || extractTitleFromText(accessibilityText || rawText);

  return {
    url: normalizedUrl,
    title: normalizedTitle,
    accessibilityText,
    elements,
    rawText,
    raw,
  };
}

export function getMcpSnapshotPreview(snapshot: Pick<McpSnapshot, "accessibilityText" | "rawText" | "elements">) {
  return {
    accessibilityTextPreview: truncateText(snapshot.accessibilityText, 500),
    rawTextPreview: truncateText(snapshot.rawText, 500),
    parsedElementsCount: snapshot.elements.length,
  };
}

export function validateMcpSnapshot(snapshot: McpSnapshot): McpSnapshotValidation {
  const accessibilityText = compactWhitespace(snapshot.accessibilityText);
  const rawText = compactWhitespace(snapshot.rawText);
  const hasElements = snapshot.elements.length > 0;
  const hasUrlOrTitle = Boolean(snapshot.url.trim() || snapshot.title.trim());
  const hasUsefulText = accessibilityText.length > 0 || rawText.length > 0;
  const combinedText = `${accessibilityText}\n${rawText}`;

  if (containsBrowserDependencyError(combinedText)) {
    return {
      ok: false,
      reason: "browser_dependency_error",
      message: "Playwright MCP aktif, tetapi browser Chromium/Chrome belum siap. Jalankan npx playwright install chromium lalu restart MCP.",
    };
  }

  if (!hasUrlOrTitle && !hasElements && !hasUsefulText) {
    return {
      ok: false,
      reason: "empty_snapshot",
      message: "Snapshot MCP kosong/tidak valid. Automasi dihentikan sebelum AI planner agar tidak salah aksi.",
    };
  }

  if (!hasElements && !hasUsefulText) {
    return {
      ok: false,
      reason: "no_accessibility_tree",
      message: "Snapshot MCP tidak memiliki accessibility tree yang bisa dipakai.",
    };
  }

  return {
    ok: true,
    message: "Snapshot MCP valid.",
  };
}

async function parseMcpHttpResponse(response: Response): Promise<ParsedMcpHttpResponse> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    const data = (await response.json().catch(() => null)) as unknown;
    return { data, contentType };
  }

  const rawText = await response.text();

  if (contentType.includes("text/event-stream")) {
    const lines = rawText.split(/\r?\n/);
    const payloads: unknown[] = [];
    let currentDataLines: string[] = [];

    const flushCurrentEvent = () => {
      if (currentDataLines.length === 0) return;
      const joined = currentDataLines.join("\n").trim();
      currentDataLines = [];
      if (!joined) return;
      const parsed = safeJsonParse<unknown>(joined);
      payloads.push(parsed ?? { rawText: joined });
    };

    for (const line of lines) {
      if (!line.trim()) {
        flushCurrentEvent();
        continue;
      }

      if (line.startsWith("data:")) {
        currentDataLines.push(line.slice(5).trimStart());
      }
    }

    flushCurrentEvent();

    const finalJsonRpc = [...payloads].reverse().find((payload) => {
      const record = asObject(payload);
      return Boolean(record && ("result" in record || "error" in record || "id" in record));
    });

    return {
      data: finalJsonRpc ?? { rawText, events: payloads },
      rawText,
      contentType,
    };
  }

  return {
    data: safeJsonParse<unknown>(rawText) ?? { rawText },
    rawText,
    contentType,
  };
}

export class PlaywrightMcpClient {
  private readonly baseUrl: string;
  private requestId = 0;
  private sessionInitialized = false;
  private sessionId: string | null = null;
  private protocolVersion = "2025-06-18";

  constructor(baseUrl = process.env.PLAYWRIGHT_MCP_URL ?? "http://localhost:8931/mcp") {
    this.baseUrl = baseUrl;
  }

  getMcpUrl() {
    return this.baseUrl;
  }

  getSessionDiagnostics() {
    return {
      sessionInitialized: this.sessionInitialized,
      sessionIdReceived: Boolean(this.sessionId),
      protocolVersion: this.protocolVersion,
      sessionId: this.sessionId,
    };
  }

  async connect(forceReinitialize = false): Promise<void> {
    if (this.sessionInitialized && !forceReinitialize) {
      return;
    }

    if (forceReinitialize) {
      this.resetSession();
    }

    const response = await this.performFetch(
      {
        stage: "mcp_connect",
        methodName: "initialize",
        toolName: undefined,
      },
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.nextId(),
          method: "initialize",
          params: {
            protocolVersion: this.protocolVersion,
            capabilities: {},
            clientInfo: {
              name: "jobapply-ass",
              version: "0.1.0",
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      throw new PlaywrightMcpError({
        stage: "mcp_connect",
        mcpUrl: this.baseUrl,
        causeMessage: `HTTP ${response.status}`,
        responseBodyPreview: responseBody.slice(0, 1000),
        metadata: {
          status: response.status,
          statusText: response.statusText,
          mcpUrl: this.baseUrl,
          stage: "mcp_connect",
          toolName: "initialize",
          sessionIdPresent: Boolean(this.sessionId),
          protocolVersion: this.protocolVersion,
          responseBodyPreview: responseBody.slice(0, 1000),
        },
        message:
          response.status >= 500
            ? `MCP gagal koneksi ke ${this.baseUrl}. Server MCP merespons ${response.status}.`
            : `MCP gagal koneksi ke ${this.baseUrl}. Pastikan npm run mcp:playwright sedang berjalan.`,
      });
    }

    const parsed = await parseMcpHttpResponse(response);
    const data = parsed.data as McpInitializeResponse | null;

    if (data?.error) {
      throw new PlaywrightMcpError({
        stage: "mcp_connect",
        mcpUrl: this.baseUrl,
        causeMessage: data.error.message || "initialize error",
        responseBodyPreview: parsed.rawText?.slice(0, 1000),
        metadata: {
          stage: "mcp_connect",
          mcpUrl: this.baseUrl,
          toolName: "initialize",
          sessionIdPresent: Boolean(this.sessionId),
          protocolVersion: this.protocolVersion,
          responseBodyPreview: parsed.rawText?.slice(0, 1000) ?? null,
        },
        message: `MCP gagal pada tahap mcp_connect: ${data.error.message || "initialize error"}. URL MCP: ${this.baseUrl}`,
      });
    }

    this.sessionId = response.headers.get("mcp-session-id");
    this.protocolVersion = data?.result?.protocolVersion ?? "2025-06-18";
    this.sessionInitialized = true;
  }

  async navigate(url: string): Promise<void> {
    await this.callTool("browser_navigate", { url });
  }

  async snapshot(): Promise<McpSnapshot> {
    const raw = await this.callTool("browser_snapshot", {
      includeAccessibilityTree: true,
      includeVisibleText: true,
      includeInteractiveElements: true,
    });

    return normalizeSnapshotPayload(raw);
  }

  async click(elementId: string, element?: string): Promise<void> {
    await this.callTool("browser_click", { element: element || elementId, ref: elementId });
  }

  async fill(elementId: string, value: string, element?: string): Promise<void> {
    await this.callTool("browser_fill", { element: element || elementId, ref: elementId, text: value });
  }

  async select(elementId: string, value: string, element?: string): Promise<void> {
    await this.callTool("browser_select", { element: element || elementId, ref: elementId, value });
  }

  async check(elementId: string, checked: boolean, element?: string): Promise<void> {
    await this.callTool("browser_check", { element: element || elementId, ref: elementId, checked });
  }

  async listTools(): Promise<unknown> {
    await this.connect();
    return this.callJsonRpc("tools/list", {}, "mcp_tools_list");
  }

  async waitForChange(previousSnapshot: McpSnapshot, timeoutMs: number): Promise<McpSnapshot> {
    const startedAt = Date.now();
    let latest = previousSnapshot;

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      latest = await this.snapshot();
      if (this.computeSnapshotFingerprint(latest) !== this.computeSnapshotFingerprint(previousSnapshot)) {
        return latest;
      }
    }

    return latest;
  }

  private computeSnapshotFingerprint(snapshot: McpSnapshot) {
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
        selected: element.selected,
        disabled: element.disabled,
      })),
    });
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const data = (await this.callJsonRpc("tools/call", {
      name,
      arguments: args,
    }, "mcp_tool_call", name)) as McpCallToolResponse | null;

    const blocks = Array.isArray(data?.result?.content) ? data?.result?.content : [];
    const text = blocks
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n");

    return safeJsonParse<unknown>(text) ?? data?.result ?? { rawText: text };
  }

  private async callJsonRpc(
    method: string,
    params: Record<string, unknown>,
    stage: string,
    toolName?: string,
    allowRetry = true,
  ): Promise<unknown> {
    await this.connect();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": this.protocolVersion,
    };

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await this.performFetch(
      {
        stage,
        methodName: method,
        toolName,
      },
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.nextId(),
          method,
          params,
        }),
      },
    );

    if (response.status === 404 && this.sessionId && allowRetry) {
      this.resetSession();
      await this.connect(true);
      return this.callJsonRpc(method, params, stage, toolName, false);
    }

    const parsed = await parseMcpHttpResponse(response);
    const payload = parsed.data as McpCallToolResponse | null;

    if (!response.ok) {
      const responseBodyPreview = parsed.rawText?.slice(0, 1000) ?? "";
      throw new PlaywrightMcpError({
        stage,
        mcpUrl: this.baseUrl,
        toolName,
        causeMessage: `HTTP ${response.status}`,
        responseBodyPreview,
        metadata: {
          status: response.status,
          statusText: response.statusText,
          mcpUrl: this.baseUrl,
          stage,
          toolName: toolName ?? method,
          sessionIdPresent: Boolean(this.sessionId),
          protocolVersion: this.protocolVersion,
          responseBodyPreview,
        },
        message:
          response.status >= 500
            ? `MCP gagal memanggil ${toolName ?? method}. Server MCP merespons ${response.status}.`
            : response.status === 400
              ? "Panggilan MCP gagal. Detail teknis tersimpan di log lokal."
              : `MCP gagal pada tahap ${stage}: HTTP ${response.status}. URL MCP: ${this.baseUrl}`,
      });
    }

    if (payload?.error) {
      throw new PlaywrightMcpError({
        stage,
        mcpUrl: this.baseUrl,
        toolName,
        causeMessage: payload.error.message || `tool error: ${toolName ?? method}`,
        responseBodyPreview: parsed.rawText?.slice(0, 1000),
        metadata: {
          stage,
          mcpUrl: this.baseUrl,
          toolName: toolName ?? method,
          sessionIdPresent: Boolean(this.sessionId),
          protocolVersion: this.protocolVersion,
          responseBodyPreview: parsed.rawText?.slice(0, 1000) ?? null,
        },
        message: `MCP gagal pada tahap ${stage}: ${payload.error.message || `tool error: ${toolName ?? method}`}. URL MCP: ${this.baseUrl}`,
      });
    }

    return payload;
  }

  private async performFetch(
    context: { stage: string; methodName: string; toolName?: string },
    init: RequestInit,
  ) {
    try {
      return await fetch(this.baseUrl, init);
    } catch (error) {
      const causeMessage = error instanceof Error ? error.message : "fetch failed";
      const message =
        context.methodName === "initialize"
          ? `MCP fetch failed saat initialize. Kemungkinan MCP sidecar belum aktif. URL MCP: ${this.baseUrl}`
          : `MCP gagal pada tahap ${context.stage}: ${causeMessage}. URL MCP: ${this.baseUrl}`;

      throw new PlaywrightMcpError({
        stage: context.stage,
        mcpUrl: this.baseUrl,
        toolName: context.toolName,
        causeMessage,
        metadata: {
          stage: context.stage,
          mcpUrl: this.baseUrl,
          toolName: context.toolName ?? context.methodName,
          sessionIdPresent: Boolean(this.sessionId),
          protocolVersion: this.protocolVersion,
        },
        message,
      });
    }
  }

  private resetSession() {
    this.sessionInitialized = false;
    this.sessionId = null;
    this.protocolVersion = "2025-06-18";
  }

  private nextId() {
    this.requestId += 1;
    return this.requestId;
  }
}
