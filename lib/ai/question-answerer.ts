import { extractJsonObject } from "@/lib/ai/json";
import { getNineRouterChatModel, getNineRouterClient } from "@/lib/ai/9router-client";
import {
  questionAnswerSchema,
  type CandidateProfileResult,
  type QuestionAnswerResult,
} from "@/lib/ai/schemas";

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
          "You answer a job application question using only provided data. Return only valid JSON. Mark requiresHumanReview=true when the question is sensitive, ambiguous, unsupported, asks for judgment, or confidence should be low.",
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

  return questionAnswerSchema.parse(extractJsonObject(content));
}
