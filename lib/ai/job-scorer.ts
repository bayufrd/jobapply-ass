import { extractJsonObject } from "@/lib/ai/json";
import { getNineRouterChatModel, getNineRouterClient } from "@/lib/ai/9router-client";
import { jobScoreSchema, type CandidateProfileResult, type JobScoreResult } from "@/lib/ai/schemas";

const ENGLISH_REASON_HINTS = [
  "overall",
  "candidate",
  "profile",
  "experience",
  "requirements",
  "salary",
  "location",
  "job title",
  "good match",
  "strong match",
  "partial match",
];

function sanitizeReasoningToIndonesian(reasoning: string) {
  return reasoning
    .replace(/\bcandidate\b/gi, "kandidat")
    .replace(/\bprofile\b/gi, "profil")
    .replace(/\boverall\b/gi, "secara keseluruhan")
    .replace(/\bexperience\b/gi, "pengalaman")
    .replace(/\brequirements\b/gi, "persyaratan")
    .replace(/\brequirement\b/gi, "persyaratan")
    .replace(/\bsalary\b/gi, "gaji")
    .replace(/\blocation\b/gi, "lokasi")
    .replace(/\bjob title\b/gi, "judul lowongan")
    .replace(/\bgood match\b/gi, "cukup cocok")
    .replace(/\bstrong match\b/gi, "sangat cocok")
    .replace(/\bpartial match\b/gi, "kecocokan sebagian")
    .replace(/\s+/g, " ")
    .trim();
}

function looksEnglish(text: string) {
  const lower = text.toLowerCase();
  return ENGLISH_REASON_HINTS.some((hint) => lower.includes(hint));
}

type CampaignContext = {
  keyword: string;
  location?: string | null;
  expectedSalary?: number | null;
  workModePreference?: string | null;
  matchThreshold?: number | null;
};

type JobContext = {
  title: string;
  company: string;
  location?: string | null;
  salaryText?: string | null;
  workType?: string | null;
  description?: string | null;
  url: string;
};

export async function scoreJobFit(
  candidateProfile: CandidateProfileResult,
  campaign: CampaignContext,
  job: JobContext,
): Promise<JobScoreResult> {
  const client = getNineRouterClient();
  const model = getNineRouterChatModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You score job fit and return JSON only. Be conservative and rely only on the provided candidate profile, campaign preferences, and visible job data. Semua reasoning, explanation, dan teks yang ditampilkan ke user wajib dalam Bahasa Indonesia.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            task: "Score this job against the candidate and campaign.",
            format: {
              skillMatch: "number 0-100",
              roleMatch: "number 0-100",
              locationMatch: "number 0-100",
              salaryCompatibility: "number 0-100",
              experienceMatch: "number 0-100",
              overallScore: "number 0-100",
              reasoning: "string",
            },
            candidateProfile,
            campaign,
            job,
          },
          null,
          2,
        ),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("9router returned an empty response during job scoring.");
  }

  const parsed = jobScoreSchema.parse(extractJsonObject(content));

  return {
    ...parsed,
    reasoning: looksEnglish(parsed.reasoning)
      ? sanitizeReasoningToIndonesian(parsed.reasoning)
      : parsed.reasoning,
  };
}
