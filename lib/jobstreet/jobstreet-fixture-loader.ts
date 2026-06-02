import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  JOBSTREET_LAYOUT_KNOWLEDGE,
  type JobstreetKnownStep,
  type JobstreetLayoutKnowledge,
} from "./jobstreet-layout-knowledge.ts";

type FixtureAnalysis = {
  title: string;
  texts: string[];
  buttons: string[];
  inputs: string[];
  questions: string[];
};

type LoadedJobstreetFixtureKnowledge = JobstreetLayoutKnowledge & {
  fixturePath: string;
  derivedVisibleTexts: string[];
  derivedButtons: string[];
  derivedInputs: string[];
  derivedQuestions: string[];
};

const FIXTURE_PATHS: Record<JobstreetKnownStep, string> = {
  choose_documents: "tests/fixtures/jobstreet/choose-documents.html",
  employer_questions: "tests/fixtures/jobstreet/answer-employer-questions.html",
  update_profile: "tests/fixtures/jobstreet/update-profile.html",
  review_submit: "tests/fixtures/jobstreet/review-and-submit.html",
  success: "tests/fixtures/jobstreet/application-sent.html",
};

function stripTags(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/'/gi, "'")
    .replace(/"/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/'/gi, "'")
    .replace(/"/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function extractTagContents(html: string, tagNames: string[]) {
  const pattern = new RegExp(`<(${tagNames.join("|")})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "gi");
  const results: string[] = [];

  for (const match of html.matchAll(pattern)) {
    const text = stripTags(match[2] ?? "");
    if (text) {
      results.push(text);
    }
  }

  return uniqueNonEmpty(results);
}

function extractAttributeValues(html: string, attributeNames: string[]) {
  const results: string[] = [];

  for (const attributeName of attributeNames) {
    const pattern = new RegExp(`${attributeName}=["']([^"']+)["']`, "gi");
    for (const match of html.matchAll(pattern)) {
      const value = decodeBasicHtml(match[1] ?? "");
      if (value) {
        results.push(value);
      }
    }
  }

  return uniqueNonEmpty(results);
}

export function extractReferenceTexts(html: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1] ?? "") : "";
  const headings = extractTagContents(html, ["h1", "h2", "h3", "p", "label", "legend", "span"]);
  const bodyText = stripTags(html);

  return uniqueNonEmpty([title, ...headings, ...bodyText.split(/\s{2,}|(?<=[.!?])\s+/)]).slice(0, 80);
}

export function extractReferenceButtons(html: string) {
  const buttonTexts = extractTagContents(html, ["button"]);
  const inputButtonValues = extractAttributeValues(html, ["value", "aria-label"]);
  return uniqueNonEmpty([...buttonTexts, ...inputButtonValues]).filter((value) =>
    /continue|lanjut|submit|kirim|apply|lamar/i.test(value),
  );
}

export function extractReferenceQuestions(html: string) {
  const texts = extractReferenceTexts(html);
  return texts.filter((value) => /\?|salary|notice period|availability|mengapa|berapa|kapan|question/i.test(value));
}

function extractReferenceInputs(html: string) {
  const labels = extractTagContents(html, ["label", "legend"]);
  const placeholders = extractAttributeValues(html, ["placeholder", "name", "id", "aria-label"]);
  return uniqueNonEmpty([...labels, ...placeholders]).slice(0, 80);
}

export function analyzeJobstreetHtmlFixture(html: string): FixtureAnalysis {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return {
    title: titleMatch ? stripTags(titleMatch[1] ?? "") : "",
    texts: extractReferenceTexts(html),
    buttons: extractReferenceButtons(html),
    inputs: extractReferenceInputs(html),
    questions: extractReferenceQuestions(html),
  };
}

export function loadJobstreetFixtureKnowledge(): LoadedJobstreetFixtureKnowledge[] {
  return JOBSTREET_LAYOUT_KNOWLEDGE.map((knowledge) => {
    const fixturePath = FIXTURE_PATHS[knowledge.step];
    const html = readFileSync(resolve(fixturePath), "utf8");
    const analysis = analyzeJobstreetHtmlFixture(html);

    return {
      ...knowledge,
      fixturePath,
      derivedVisibleTexts: uniqueNonEmpty([...knowledge.expectedVisibleTexts, ...analysis.texts]),
      derivedButtons: uniqueNonEmpty([...knowledge.expectedButtons, ...analysis.buttons]),
      derivedInputs: uniqueNonEmpty([...(knowledge.expectedInputs ?? []), ...analysis.inputs]),
      derivedQuestions: uniqueNonEmpty([...(knowledge.expectedQuestionPatterns ?? []), ...analysis.questions]),
    };
  });
}
