export class PlaywrightMcpError extends Error {
  stage: string;
  mcpUrl: string;
  toolName?: string;
  causeMessage?: string;

  constructor(input: {
    message: string;
    stage: string;
    mcpUrl: string;
    toolName?: string;
    causeMessage?: string;
  }) {
    super(input.message);
    this.name = "PlaywrightMcpError";
    this.stage = input.stage;
    this.mcpUrl = input.mcpUrl;
    this.toolName = input.toolName;
    this.causeMessage = input.causeMessage;
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
  raw?: unknown;
};

type McpCallToolResponse = {
  result?: McpToolResponse;
  error?: {
    message?: string;
  };
};

type McpInitializeResponse = {
  result?: {
    protocolVersion?: string;
    serverInfo?: {
      name?: string;
      version?: string;
    };
  };
  error?: {
    message?: string;
  };
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

function normalizeSnapshotPayload(raw: unknown): McpSnapshot {
  const payload = (asObject(raw) ?? {}) as SnapshotPayload;
  const elementsSource = Array.isArray(payload.elements)
    ? payload.elements
    : Array.isArray(payload.nodes)
      ? payload.nodes
      : [];

  const elements = elementsSource.map(sanitizeElement).filter((item): item is McpElement => Boolean(item));
  const accessibilityText = pickString(payload.accessibilityText)
    || pickString(payload.text)
    || extractTextBlocks(raw).join("\n").slice(0, 20000);

  return {
    url: pickString(payload.url),
    title: pickString(payload.title),
    accessibilityText,
    elements,
    raw,
  };
}

export class PlaywrightMcpClient {
  private readonly baseUrl: string;
  private requestId = 0;
  private sessionInitialized = false;

  constructor(baseUrl = process.env.PLAYWRIGHT_MCP_URL ?? "http://localhost:8931/mcp") {
    this.baseUrl = baseUrl;
  }

  getMcpUrl() {
    return this.baseUrl;
  }

  async connect(): Promise<void> {
    if (this.sessionInitialized) {
      return;
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
            protocolVersion: "2024-11-05",
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
      throw new PlaywrightMcpError({
        stage: "mcp_connect",
        mcpUrl: this.baseUrl,
        causeMessage: `HTTP ${response.status}`,
        message:
          response.status >= 500
            ? `MCP gagal koneksi ke ${this.baseUrl}. Server MCP merespons ${response.status}.`
            : `MCP gagal koneksi ke ${this.baseUrl}. Pastikan npm run mcp:playwright sedang berjalan.`,
      });
    }

    const data = (await response.json().catch(() => null)) as McpInitializeResponse | null;
    if (data?.error) {
      throw new PlaywrightMcpError({
        stage: "mcp_connect",
        mcpUrl: this.baseUrl,
        causeMessage: data.error.message || "initialize error",
        message: `MCP gagal pada tahap mcp_connect: ${data.error.message || "initialize error"}. URL MCP: ${this.baseUrl}`,
      });
    }

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

  async click(elementId: string): Promise<void> {
    await this.callTool("browser_click", { elementId });
  }

  async fill(elementId: string, value: string): Promise<void> {
    await this.callTool("browser_fill", { elementId, value });
  }

  async select(elementId: string, value: string): Promise<void> {
    await this.callTool("browser_select", { elementId, value });
  }

  async check(elementId: string, checked: boolean): Promise<void> {
    await this.callTool("browser_check", { elementId, checked });
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
    await this.connect();

    const response = await this.performFetch(
      {
        stage: "mcp_tool_call",
        methodName: "tools/call",
        toolName: name,
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
          method: "tools/call",
          params: {
            name,
            arguments: args,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new PlaywrightMcpError({
        stage: "mcp_tool_call",
        mcpUrl: this.baseUrl,
        toolName: name,
        causeMessage: `HTTP ${response.status}`,
        message:
          response.status >= 500
            ? `MCP gagal memanggil ${name}. Server MCP merespons ${response.status}.`
            : `MCP gagal pada tahap mcp_tool_call: HTTP ${response.status}. URL MCP: ${this.baseUrl}`,
      });
    }

    const data = (await response.json().catch(() => null)) as McpCallToolResponse | null;
    if (data?.error) {
      throw new PlaywrightMcpError({
        stage: "mcp_tool_call",
        mcpUrl: this.baseUrl,
        toolName: name,
        causeMessage: data.error.message || `tool error: ${name}`,
        message: `MCP gagal pada tahap mcp_tool_call: ${data.error.message || `tool error: ${name}`}. URL MCP: ${this.baseUrl}`,
      });
    }

    const blocks = Array.isArray(data?.result?.content) ? data?.result?.content : [];
    const text = blocks
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n");

    return safeJsonParse<unknown>(text) ?? data?.result ?? { rawText: text };
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
        message,
      });
    }
  }

  private nextId() {
    this.requestId += 1;
    return this.requestId;
  }
}
