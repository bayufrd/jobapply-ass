import { NextResponse } from "next/server";
import { answerApplicationQuestion } from "@/lib/ai/question-answerer";
import {
  NINE_ROUTER_CONFIG_ERROR_MESSAGE,
  NINE_ROUTER_MODEL_ERROR_MESSAGE,
} from "@/lib/ai/9router-config";
import { prisma } from "@/lib/db/prisma";

type RequestBody = {
  question?: string;
  candidateProfileId?: string;
  campaignDefaults?: {
    currentSalary?: number | null;
    expectedSalary?: number | null;
    noticePeriod?: string | null;
    availability?: string | null;
  };
};

function normalizeQuestion(question: string) {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

function isNineRouterConfigError(message: string) {
  return (
    message === NINE_ROUTER_CONFIG_ERROR_MESSAGE ||
    message === NINE_ROUTER_MODEL_ERROR_MESSAGE ||
    message.includes("NINEROUTER_URL") ||
    message.includes("NINEROUTER_KEY") ||
    message.includes("NINEROUTER_CHAT_MODEL") ||
    message.includes("NINE_ROUTER_CHAT_MODEL")
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    if (!body.question || !body.candidateProfileId) {
      return NextResponse.json(
        { error: "question and candidateProfileId are required." },
        { status: 400 },
      );
    }

    const candidateProfile = await prisma.candidateProfile.findUnique({
      where: { id: body.candidateProfileId },
    });

    if (!candidateProfile) {
      return NextResponse.json({ error: "Candidate profile not found." }, { status: 404 });
    }

    const normalizedQuestion = normalizeQuestion(body.question);
    const knownMemories = await prisma.questionMemory.findMany({
      take: 10,
      orderBy: { usageCount: "desc" },
    });

    const answer = await answerApplicationQuestion({
      question: body.question,
      candidateProfile: {
        fullName: candidateProfile.fullName ?? "",
        email: candidateProfile.email ?? "",
        phone: candidateProfile.phone ?? "",
        location: candidateProfile.location ?? "",
        summary: candidateProfile.summary ?? "",
        skills: JSON.parse(candidateProfile.skillsJson ?? "[]") as string[],
        workExperience: JSON.parse(candidateProfile.experienceJson ?? "[]") as Array<Record<string, unknown>>,
        education: JSON.parse(candidateProfile.educationJson ?? "[]") as Array<Record<string, unknown>>,
        projects: JSON.parse(candidateProfile.projectsJson ?? "[]") as Array<Record<string, unknown>>,
        certifications: JSON.parse(candidateProfile.certificationsJson ?? "[]") as string[],
        suggestedJobRoles: [],
      },
      campaignDefaults: body.campaignDefaults ?? {},
      knownAnswers: knownMemories.map((memory) => ({
        question: memory.questionRaw,
        answer: memory.answer,
      })),
    });

    await prisma.questionMemory.upsert({
      where: { questionNormalized: normalizedQuestion },
      update: {
        answer: answer.answer,
        confidence: answer.confidence,
        usageCount: { increment: 1 },
        source: answer.requiresHumanReview ? "ai_pending_review" : "ai",
      },
      create: {
        questionRaw: body.question,
        questionNormalized: normalizedQuestion,
        answer: answer.answer,
        source: answer.requiresHumanReview ? "ai_pending_review" : "ai",
        confidence: answer.confidence,
        usageCount: 1,
      },
    });

    return NextResponse.json({ success: true, answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Question answering failed.";

    if (isNineRouterConfigError(message)) {
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
