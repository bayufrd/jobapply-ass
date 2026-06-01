import { z } from "zod";

export const candidateProfileSchema = z.object({
  fullName: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  location: z.string().default(""),
  summary: z.string().default(""),
  skills: z.array(z.string()).default([]),
  workExperience: z.array(z.record(z.string(), z.any())).default([]),
  education: z.array(z.record(z.string(), z.any())).default([]),
  projects: z.array(z.record(z.string(), z.any())).default([]),
  certifications: z.array(z.string()).default([]),
  suggestedJobRoles: z.array(z.string()).default([]),
});

export type CandidateProfileResult = z.infer<typeof candidateProfileSchema>;

export const jobScoreSchema = z.object({
  skillMatch: z.number().min(0).max(100),
  roleMatch: z.number().min(0).max(100),
  locationMatch: z.number().min(0).max(100),
  salaryCompatibility: z.number().min(0).max(100),
  experienceMatch: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  reasoning: z.string(),
});

export type JobScoreResult = z.infer<typeof jobScoreSchema>;

export const questionAnswerSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  evidence: z.array(z.string()).default([]),
  requiresHumanReview: z.boolean().default(false),
});

export type QuestionAnswerResult = z.infer<typeof questionAnswerSchema>;
