import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  analyzeJobstreetHtmlFixture,
  extractReferenceButtons,
  extractReferenceQuestions,
  extractReferenceTexts,
  loadJobstreetFixtureKnowledge,
} from "../lib/jobstreet/jobstreet-fixture-loader.ts";

function readFixture(name: string) {
  return readFileSync(resolve(`tests/fixtures/jobstreet/${name}`), "utf8");
}

test("choose documents fixture exposes expected texts and Continue button", () => {
  const html = readFixture("choose-documents.html");
  const texts = extractReferenceTexts(html);
  const buttons = extractReferenceButtons(html);

  assert.equal(texts.some((value) => /choose documents/i.test(value)), true);
  assert.equal(texts.some((value) => /resum[eé] attached/i.test(value)), true);
  assert.equal(buttons.some((value) => /continue/i.test(value)), true);
});

test("employer questions fixture exposes question texts and input-like prompts", () => {
  const html = readFixture("answer-employer-questions.html");
  const analysis = analyzeJobstreetHtmlFixture(html);
  const questions = extractReferenceQuestions(html);

  assert.equal(analysis.texts.some((value) => /answer employer questions/i.test(value)), true);
  assert.equal(analysis.inputs.length > 0, true);
  assert.equal(questions.length > 0, true);
});

test("update profile fixture knowledge includes anti-pattern guidance and Continue expectation", () => {
  const knowledge = loadJobstreetFixtureKnowledge().find((item) => item.step === "update_profile");

  assert.ok(knowledge);
  assert.equal(knowledge.expectedButtons.includes("Continue"), true);
  assert.equal(knowledge.antiPatterns?.includes("Profile does not mean login"), true);
  assert.equal(knowledge.antiPatterns?.includes("Skip to content does not mean login"), true);
  assert.equal(knowledge.antiPatterns?.includes("Open app does not mean login"), true);
  assert.equal(knowledge.antiPatterns?.includes("SIGN_IN_PAGE in script/config does not mean login"), true);
});

test("review fixture knowledge expects Submit application and excludes non-submit anti-patterns", () => {
  const knowledge = loadJobstreetFixtureKnowledge().find((item) => item.step === "review_submit");

  assert.ok(knowledge);
  assert.equal(knowledge.expectedButtons.includes("Submit application"), true);
  assert.equal(knowledge.antiPatterns?.includes("View job description is not submit"), true);
  assert.equal(knowledge.antiPatterns?.includes("Explore site is not submit"), true);
});

test("success fixture knowledge includes success markers", () => {
  const knowledge = loadJobstreetFixtureKnowledge().find((item) => item.step === "success");

  assert.ok(knowledge);
  assert.equal(knowledge.successMarkers?.includes("Nice work"), true);
  assert.equal(knowledge.successMarkers?.includes("Your application has been sent"), true);
});
