import { z } from "zod";
import { getNineRouterChatModel, getNineRouterClient } from "@/lib/ai/9router-client";
import { extractJsonObject } from "@/lib/ai/json";
import type { CandidateProfileResult } from "@/lib/ai/schemas";
import type { DomSnapshot } from "@/lib/browser/dom-snapshot";

const uiActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    elementId: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("fill"),
    elementId: z.string(),
    value: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("select"),
    elementId: z.string(),
    value: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("check"),
    elementId: z.string(),
    checked: z.boolean(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("choose_radio"),
    elementId: z.string(),
    value: z.string().optional(),
    reason: z.string(),
  }),
]);

export const uiActionPlanSchema = z.object({
  goal: z.enum([
    "click_apply",
    "fill_form",
    "answer_question",
    "continue",
    "final_submit",
    "ask_user",
    "skip_job",
    "wait",
    "manual_intervention",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  reasoningId: z.string(),
  userFacingReason: z.string(),
  safeToExecute: z.boolean(),
  safeToSubmit: z.boolean(),
  needsUserInput: z.boolean(),
  userQuestion: z.string().optional(),
  suggestedAnswer: z.string().optional(),
  answerOptions: z.array(z.string()).optional(),
  reason: z.string().optional(),
  actions: z.array(uiActionSchema).default([]),
});

export type UiActionPlan = z.infer<typeof uiActionPlanSchema>;

type PlannerCampaign = {
  id?: string;
  name?: string;
  keyword?: string;
  location?: string | null;
  defaultCurrentSalary?: number | null;
  defaultExpectedSalary?: number | null;
  defaultNoticePeriod?: string | null;
  defaultAvailability?: string | null;
  workModePreference?: string | null;
  formAutomationMode?: string | null;
};

type PlannerJobListing = {
  id?: string;
  title: string;
  company: string;
  location?: string | null;
  salaryText?: string | null;
  workType?: string | null;
  url: string;
  description?: string | null;
};

type PlannerQuestionMemory = Array<{
  question: string;
  answer: string;
  confidence?: number;
  source?: string;
}>;

type PlannerState = {
  step: number;
  mode: "review_each_application" | "auto_submit_safe_only";
  previousGoal?: string | null;
  previousReason?: string | null;
  repeatedFingerprintCount?: number;
  externalRedirect?: boolean;
  wizardHistory?: Array<{
    step: number;
    goal: string;
    reason?: string | null;
  }>;
};

type UiPlannerInput = {
  domSnapshot: DomSnapshot;
  candidateProfile: CandidateProfileResult;
  campaign: PlannerCampaign;
  jobListing: PlannerJobListing;
  questionMemory: PlannerQuestionMemory;
  currentApplicationState: PlannerState;
  safetyMode: "strict" | "normal";
};

function buildAllowedElementIds(snapshot: DomSnapshot) {
  return snapshot.elements.map((element) => element.elementId);
}

function sanitizeSnapshotForPrompt(snapshot: DomSnapshot) {
  return {
    currentUrl: snapshot.currentUrl,
    pageTitle: snapshot.pageTitle,
    visibleTextSummary: snapshot.visibleTextSummary,
    elements: snapshot.elements.map((element) => ({
      elementId: element.elementId,
      tag: element.tag,
      role: element.role,
      type: element.type,
      text: element.text,
      label: element.label,
      placeholder: element.placeholder,
      name: element.name,
      ariaLabel: element.ariaLabel,
      valuePreview: element.valuePreview,
      required: element.required,
      disabled: element.disabled,
      checked: element.checked,
      selected: element.selected,
      options: element.options,
      boundingBox: element.boundingBox,
      isVisible: element.isVisible,
      isInViewport: element.isInViewport,
      nearbyText: element.nearbyText,
      formSectionText: element.formSectionText,
    })),
  };
}

function fallbackAskUser(reason: string, userQuestion?: string, answerOptions?: string[]): UiActionPlan {
  return {
    goal: "ask_user",
    confidence: 0,
    reasoningId: "planner_fallback_ask_user",
    userFacingReason: reason,
    safeToExecute: false,
    safeToSubmit: false,
    needsUserInput: true,
    userQuestion,
    suggestedAnswer: undefined,
    answerOptions,
    reason,
    actions: [],
  };
}

function applySafetyValidation(plan: UiActionPlan, snapshot: DomSnapshot): UiActionPlan {
  const allowedIds = new Set(buildAllowedElementIds(snapshot));
  const invalidAction = plan.actions.find((action) => !allowedIds.has(action.elementId));

  if (invalidAction) {
    return fallbackAskUser(
      "AI memilih elemen yang tidak tersedia pada tampilan saat ini.",
      "Sistem butuh bantuan karena elemen yang dipilih AI tidak valid.",
    );
  }

  const blockedAction = plan.actions.find((action) => {
    const element = snapshot.elements.find((item) => item.elementId === action.elementId);
    if (!element) return true;
    const combined = [
      element.text,
      element.label,
      element.ariaLabel,
      element.placeholder,
      element.nearbyText,
      element.formSectionText,
    ].join(" ").toLowerCase();

    return [
      "captcha",
      "otp",
      "one-time password",
      "verification code",
      "security verification",
      "password",
      "login",
      "sign in",
      "browser extension",
      "payment",
      "credit card",
    ].some((pattern) => combined.includes(pattern));
  });

  if (blockedAction) {
    return fallbackAskUser(
      "AI mengarah ke elemen yang diblokir oleh guardrail keamanan.",
      "Sistem membutuhkan keputusan Anda untuk kasus verifikasi atau keamanan.",
      ["Ya", "Tidak"],
    );
  }

  if (plan.goal === "final_submit" && (!plan.safeToSubmit || plan.confidence < 0.9)) {
    return fallbackAskUser(
      "AI belum cukup yakin untuk melakukan submit final secara aman.",
      "Submit belum bisa diverifikasi aman. Pilih keputusan untuk melanjutkan.",
      ["Accept", "Retry Verification", "Skip Job", "Open Browser"],
    );
  }

  return plan;
}

export async function planUiNextActions(input: UiPlannerInput): Promise<UiActionPlan> {
  const client = getNineRouterClient();
  const model = getNineRouterChatModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: [
          "You are controlling an AI-first job application assistant.",
          "Return only valid JSON.",
          "You must only choose from visible element IDs in the provided snapshot.",
          "Never invent selectors.",
          "Never click captcha, login security, OTP, verification, password, payment, browser permission, or browser extension elements.",
          "Never fill password fields.",
          "Never access cookies, tokens, or localStorage.",
          "Never submit if required fields are empty.",
          "Never submit if confidence < 0.9.",
          "Allowed actions are click, fill, select, check, choose_radio.",
          "Use ask_user for unknown Yes/No, text, select, salary, external redirect, or submit verification decisions.",
          "Do not tell the user to check the browser for normal form questions.",
          "Only pause for manual_intervention on captcha, OTP, login, or security verification.",
          "If final submit is visible and all required fields are filled, set goal=final_submit and safeToSubmit=true.",
          "If there is a recruiter question not answerable from CV, campaign defaults, memory, or prior decisions, return ask_user.",
          "Prefer Apply/Lamar, then Continue/Next/Lanjut/Selanjutnya, then final submit when safe.",
          "Do not treat Continue as final submit.",
          "Do not treat Submit Application as Continue.",
          "All userFacingReason, userQuestion, suggestedAnswer, reason, and answerOptions must be in Bahasa Indonesia when applicable.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            task: "Tentukan aksi UI aman berikutnya untuk proses lamaran kerja.",
            format: {
              goal: "click_apply | fill_form | answer_question | continue | final_submit | ask_user | skip_job | wait | manual_intervention | unknown",
              confidence: "number 0-1",
              reasoningId: "string",
              userFacingReason: "string Bahasa Indonesia",
              safeToExecute: "boolean",
              safeToSubmit: "boolean",
              needsUserInput: "boolean",
              userQuestion: "optional string Bahasa Indonesia",
              suggestedAnswer: "optional string Bahasa Indonesia",
              answerOptions: ["optional pilihan Bahasa Indonesia"],
              reason: "optional string Bahasa Indonesia",
              actions: [
                '{"type":"click","elementId":"ai-1","reason":"string"}',
                '{"type":"fill","elementId":"ai-2","value":"string","reason":"string"}',
                '{"type":"select","elementId":"ai-3","value":"string","reason":"string"}',
                '{"type":"check","elementId":"ai-4","checked":true,"reason":"string"}',
                '{"type":"choose_radio","elementId":"ai-5","value":"Ya","reason":"string"}',
              ],
            },
            safetyMode: input.safetyMode,
            currentApplicationState: input.currentApplicationState,
            candidateProfile: input.candidateProfile,
            campaign: input.campaign,
            jobListing: input.jobListing,
            questionMemory: input.questionMemory,
            allowedElementIds: buildAllowedElementIds(input.domSnapshot),
            domSnapshot: sanitizeSnapshotForPrompt(input.domSnapshot),
          },
          null,
          2,
        ),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return fallbackAskUser(
      "AI tidak mengembalikan rencana aksi.",
      "Sistem tidak menerima rencana aksi dari AI untuk langkah berikutnya.",
    );
  }

  const parsed = uiActionPlanSchema.parse(extractJsonObject(content));
  return applySafetyValidation(parsed, input.domSnapshot);
}
