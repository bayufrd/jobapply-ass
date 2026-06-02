import { extractJsonObject } from "@/lib/ai/json";
import { getNineRouterChatModel, getNineRouterClient } from "@/lib/ai/9router-client";
import {
  questionAnswerSchema,
  type CandidateProfileResult,
  type QuestionAnswerResult,
} from "@/lib/ai/schemas";

const ENGLISH_REASON_HINTS = [
  "candidate",
  "profile",
  "experience",
  "overall",
  "sensitive",
  "confidence",
  "insufficient",
  "ambiguous",
];

function sanitizeTextToIndonesian(text: string) {
  return text
    .replace(/\bcandidate\b/gi, "kandidat")
    .replace(/\bprofile\b/gi, "profil")
    .replace(/\bexperience\b/gi, "pengalaman")
    .replace(/\boverall\b/gi, "secara keseluruhan")
    .replace(/\bsensitive\b/gi, "sensitif")
    .replace(/\bconfidence\b/gi, "keyakinan")
    .replace(/\binsufficient\b/gi, "belum cukup")
    .replace(/\bambiguous\b/gi, "ambigu")
    .replace(/\s+/g, " ")
    .trim();
}

function looksEnglish(text: string) {
  const lower = text.toLowerCase();
  return ENGLISH_REASON_HINTS.some((hint) => lower.includes(hint));
}

type AnswerQuestionInput = {
  question: string;
  candidateProfile: CandidateProfileResult;
  campaignDefaults: {
    currentSalary?: number | null;
    expectedSalary?: number | null;
    noticePeriod?: string | null;
    availability?: string | null;
  };
  knownAnswers?: Array<{ question: string; answer: string }>;
};

export async function answerApplicationQuestion({
  question,
  candidateProfile,
  campaignDefaults,
  knownAnswers = [],
}: AnswerQuestionInput): Promise<QuestionAnswerResult> {
  const client = getNineRouterClient();
  const model = getNineRouterChatModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You answer a job application question using only provided data. Return JSON only. Semua reasoning, explanation, evidence, dan teks yang ditampilkan ke user wajib dalam Bahasa Indonesia. Mark requiresHumanReview=true when the question is sensitive, ambiguous, unsupported, asks for judgment, or confidence should be low.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            task: "Answer the application question for assisted auto apply with human oversight.",
            question,
            candidateProfile,
            campaignDefaults,
            knownAnswers,
            format: {
              answer: "string",
              confidence: "number 0-1",
              reasoning: "string",
              evidence: ["string"],
              requiresHumanReview: "boolean",
            },
          },
          null,
          2,
        ),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("9router returned an empty response during question answering.");
  }

  const parsed = questionAnswerSchema.parse(extractJsonObject(content));

  return {
    ...parsed,
    reasoning: looksEnglish(parsed.reasoning) ? sanitizeTextToIndonesian(parsed.reasoning) : parsed.reasoning,
    evidence: parsed.evidence.map((item) => (looksEnglish(item) ? sanitizeTextToIndonesian(item) : item)),
  };
}
