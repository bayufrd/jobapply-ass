import { extractJsonObject } from "@/lib/ai/json";
import { getNineRouterChatModel, getNineRouterClient } from "@/lib/ai/9router-client";
import { jobScoreSchema, type CandidateProfileResult, type JobScoreResult } from "@/lib/ai/schemas";

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
          "You score job fit and return only valid JSON. Be conservative and rely only on the provided candidate profile, campaign preferences, and visible job data.",
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

  return jobScoreSchema.parse(extractJsonObject(content));
}
