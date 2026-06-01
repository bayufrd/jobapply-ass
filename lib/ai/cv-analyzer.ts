import { extractJsonObject } from "@/lib/ai/json";
import { getNineRouterChatModel, getNineRouterClient } from "@/lib/ai/9router-client";
import { candidateProfileSchema, type CandidateProfileResult } from "@/lib/ai/schemas";

export async function analyzeCvText(cvText: string): Promise<CandidateProfileResult> {
  const client = getNineRouterClient();
  const model = getNineRouterChatModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You analyze CV text and return only valid JSON. Infer only what is supported by the CV. Leave missing fields as empty strings or empty arrays.",
      },
      {
        role: "user",
        content: `Convert this CV into JSON with keys: fullName, email, phone, location, summary, skills, workExperience, education, projects, certifications, suggestedJobRoles.\n\nCV:\n${cvText}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("9router returned an empty response during CV analysis.");
  }

  return candidateProfileSchema.parse(extractJsonObject(content));
}
