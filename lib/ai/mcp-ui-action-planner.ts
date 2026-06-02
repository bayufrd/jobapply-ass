import { getNineRouterChatModel, getNineRouterClient } from "@/lib/ai/9router-client";
import { extractJsonObject } from "@/lib/ai/json";
import type { NormalizedMcpPage } from "@/lib/mcp/mcp-snapshot-normalizer";

export type McpAiActionPlan = {
  goal:
    | "click_apply"
    | "fill_form"
    | "answer_question"
    | "continue"
    | "final_submit"
    | "ask_user"
    | "skip_job"
    | "manual_intervention"
    | "wait"
    | "unknown";
  confidence: number;
  safeToExecute: boolean;
  safeToSubmit: boolean;
  userFacingReason: string;
  actions: Array<
    | { type: "click"; elementId: string; reason: string }
    | { type: "fill"; elementId: string; value: string; reason: string }
    | { type: "select"; elementId: string; value: string; reason: string }
    | { type: "check"; elementId: string; checked: boolean; reason: string }
  >;
  needsUserInput?: boolean;
  userQuestion?: string;
  suggestedAnswer?: string;
  answerOptions?: string[];
};

type PlannerInput = {
  page: NormalizedMcpPage;
  candidateProfile: Record<string, unknown>;
  campaignDefaults: Record<string, unknown>;
  jobListing: Record<string, unknown>;
  questionMemory: Array<Record<string, unknown>>;
  previousActions: Array<Record<string, unknown>>;
  mode: string;
};

const SENSITIVE_PATTERNS = [/captcha/i, /otp/i, /password/i, /login/i, /security/i, /verification/i];

function validateElementIds(plan: McpAiActionPlan, page: NormalizedMcpPage) {
  const ids = new Set([
    ...page.buttons.map((item) => item.elementId),
    ...page.inputs.map((item) => item.elementId),
    ...page.selects.map((item) => item.elementId),
    ...page.checkboxes.map((item) => item.elementId),
    ...page.radios.map((item) => item.elementId),
    ...page.submitCandidates.map((item) => item.elementId),
  ]);

  return {
    ...plan,
    actions: plan.actions.filter((action) => ids.has(action.elementId)),
  };
}

function detectSensitivePage(page: NormalizedMcpPage) {
  const haystack = `${page.title}\n${page.visibleTextSummary}\n${page.buttons.map((item) => item.label).join("\n")}`;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(haystack));
}

function buildFallbackPlan(page: NormalizedMcpPage): McpAiActionPlan {
  if (detectSensitivePage(page) || page.pageKind === "login_or_security") {
    return {
      goal: "manual_intervention",
      confidence: 1,
      safeToExecute: false,
      safeToSubmit: false,
      userFacingReason: "Perlu intervensi manual untuk login, captcha, OTP, atau verifikasi keamanan.",
      actions: [],
      needsUserInput: true,
      userQuestion: "Silakan selesaikan login, captcha, OTP, atau verifikasi keamanan di browser visible.",
      answerOptions: ["Buka Browser"],
    };
  }

  if (page.pageKind === "final_submit_step" && page.submitCandidates.length === 0) {
    return {
      goal: "ask_user",
      confidence: 0.4,
      safeToExecute: false,
      safeToSubmit: false,
      userFacingReason: "Halaman terlihat seperti submit akhir, tetapi tombol submit belum terdeteksi jelas.",
      actions: [],
      needsUserInput: true,
      userQuestion: "Tombol submit akhir belum terlihat jelas pada snapshot MCP.",
      answerOptions: ["Retry", "Skip Job", "Open Browser"],
    };
  }

  return {
    goal: "ask_user",
    confidence: 0.3,
    safeToExecute: false,
    safeToSubmit: false,
    userFacingReason: "AI belum yakin terhadap aksi aman berikutnya dari halaman yang terlihat.",
    actions: [],
    needsUserInput: true,
    userQuestion: "AI belum yakin terhadap field atau tombol berikutnya.",
    answerOptions: ["Retry", "Skip Job", "Edit Answer"],
  };
}

export async function planMcpUiAction(input: PlannerInput): Promise<McpAiActionPlan> {
  if (detectSensitivePage(input.page)) {
    return buildFallbackPlan(input.page);
  }

  const client = getNineRouterClient();
  const model = getNineRouterChatModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "Anda adalah planner automasi UI MCP. Balas JSON saja. Semua teks untuk user harus Bahasa Indonesia. Hanya boleh memakai elementId yang tersedia. Jangan pernah mengarang selector. Jangan klik captcha, OTP, login, security verification, password field. Jangan isi password. Jangan submit jika confidence < 0.9. Jangan submit jika field wajib yang terlihat masih kosong. Continue/Next/Lanjut bukan final submit. Submit Application/Kirim Lamaran adalah final submit. Utamakan aksi yang benar-benar terlihat di halaman MCP, bukan state internal aplikasi.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            task: "Rencanakan aksi UI berikutnya dari snapshot MCP yang terlihat.",
            page: input.page,
            candidateProfile: input.candidateProfile,
            campaignDefaults: input.campaignDefaults,
            jobListing: input.jobListing,
            questionMemory: input.questionMemory,
            previousActions: input.previousActions,
            mode: input.mode,
            outputSchema: {
              goal: [
                "click_apply",
                "fill_form",
                "answer_question",
                "continue",
                "final_submit",
                "ask_user",
                "skip_job",
                "manual_intervention",
                "wait",
                "unknown",
              ],
              confidence: "number",
              safeToExecute: "boolean",
              safeToSubmit: "boolean",
              userFacingReason: "string dalam Bahasa Indonesia",
              actions: [
                {
                  type: "click | fill | select | check",
                  elementId: "harus berasal dari halaman MCP",
                  value: "string bila perlu",
                  checked: "boolean bila perlu",
                  reason: "string singkat Bahasa Indonesia",
                },
              ],
              needsUserInput: "boolean opsional",
              userQuestion: "string opsional Bahasa Indonesia",
              suggestedAnswer: "string opsional Bahasa Indonesia",
              answerOptions: ["string"],
            },
          },
          null,
          2,
        ),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = extractJsonObject(raw) as McpAiActionPlan;
  const sanitized = validateElementIds(parsed, input.page);

  if (!sanitized.goal || !Array.isArray(sanitized.actions)) {
    return buildFallbackPlan(input.page);
  }

  if (sanitized.goal === "final_submit" && (sanitized.confidence < 0.9 || sanitized.safeToSubmit !== true)) {
    return {
      ...sanitized,
      goal: "ask_user",
      safeToExecute: false,
      safeToSubmit: false,
      userFacingReason: "Submit akhir diblokir karena keyakinan AI belum cukup tinggi.",
      actions: [],
      needsUserInput: true,
      userQuestion: "Submit akhir belum cukup aman untuk dijalankan otomatis.",
      answerOptions: ["Retry", "Open Browser", "Skip Job"],
    };
  }

  return sanitized;
}
