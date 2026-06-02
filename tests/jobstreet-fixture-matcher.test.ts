import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchLiveSnapshotToJobstreetKnowledge } from "../lib/jobstreet/jobstreet-fixture-matcher.ts";
import type { McpSnapshot } from "../lib/mcp/playwright-mcp-client.ts";

function readFixture(name: string) {
  return readFileSync(resolve(`tests/fixtures/jobstreet/${name}`), "utf8");
}

function createSnapshot(url: string, title: string, accessibilityText: string, buttons: string[] = []): McpSnapshot {
  return {
    url,
    title,
    accessibilityText,
    rawText: accessibilityText,
    elements: buttons.map((label, index) => ({
      elementId: `btn-${index + 1}`,
      role: "button",
      name: label,
      text: label,
      value: undefined,
      checked: false,
      selected: false,
      disabled: false,
    })),
  };
}

function normalizeForMatcher(snapshot: McpSnapshot) {
  const buttons = snapshot.elements.map((element) => ({
    elementId: element.elementId,
    label: element.name ?? element.text ?? "",
    disabled: element.disabled ?? false,
  }));

  return {
    url: snapshot.url,
    title: snapshot.title,
    pageKind: "apply_form" as const,
    visibleTextSummary: snapshot.accessibilityText,
    buttons,
    inputs: [],
    selects: [],
    checkboxes: [],
    radios: [],
    questions: [],
    submitCandidates: buttons
      .filter((item) => /submit application|kirim lamaran/i.test(item.label))
      .map((item) => ({
        elementId: item.elementId,
        label: item.label,
        confidenceHint: "high",
      })),
  };
}

test("choose documents fixture matches choose_documents with Continue evidence", () => {
  const html = readFixture("choose-documents.html");
  const normalized = normalizeForMatcher(
    createSnapshot(
      "https://id.jobstreet.com/job/92275484/apply?sol=abc",
      "Choose documents - Jobstreet",
      html,
      ["Continue"],
    ),
  );

  const result = matchLiveSnapshotToJobstreetKnowledge(normalized, normalized.url);
  assert.equal(result.step, "choose_documents");
  assert.equal(result.confidence >= 0.55, true);
});

test("employer questions fixture matches employer_questions and keeps question evidence", () => {
  const html = readFixture("answer-employer-questions.html");
  const normalized = normalizeForMatcher(
    createSnapshot(
      "https://id.jobstreet.com/job/92275484/apply/role-requirements?sol=abc",
      "Answer employer questions - Jobstreet",
      html,
      ["Continue"],
    ),
  );

  const result = matchLiveSnapshotToJobstreetKnowledge(normalized, normalized.url);
  assert.equal(result.step, "employer_questions");
  assert.equal(result.matchedSignals.some((value) => /teks fixture cocok/i.test(value)), true);
});

test("update profile fixture matches update_profile and does not imply login/manual intervention", () => {
  const html = readFixture("update-profile.html");
  const normalized = normalizeForMatcher(
    createSnapshot(
      "https://id.jobstreet.com/job/92231298/apply/profile?sol=abc",
      "Update Jobstreet Profile - Jobstreet",
      html,
      ["Continue", "Open app"],
    ),
  );

  const result = matchLiveSnapshotToJobstreetKnowledge(normalized, normalized.url);
  assert.equal(result.step, "update_profile");
  assert.equal(result.confidence >= 0.55, true);
  assert.equal(result.warnings.some((value) => /jangan salah klasifikasi sebagai login/i.test(value)), true);
});

test("review fixture matches review_submit only with live Submit application evidence", () => {
  const html = readFixture("review-and-submit.html");
  const normalized = normalizeForMatcher(
    createSnapshot(
      "https://id.jobstreet.com/job/92275484/apply/review?sol=abc",
      "Review and submit - Jobstreet",
      html,
      ["View job description", "Submit application"],
    ),
  );

  const result = matchLiveSnapshotToJobstreetKnowledge(normalized, normalized.url);
  assert.equal(result.step, "review_submit");
  assert.equal(result.confidence >= 0.55, true);
});

test("review fixture does not overclaim final submit when live submit button is absent", () => {
  const html = readFixture("review-and-submit.html");
  const normalized = normalizeForMatcher(
    createSnapshot(
      "https://id.jobstreet.com/job/92275484/apply/review?sol=abc",
      "Review and submit - Jobstreet",
      html,
      ["View job description", "Explore site", "Back"],
    ),
  );

  const result = matchLiveSnapshotToJobstreetKnowledge(normalized, normalized.url);
  assert.equal(result.warnings.some((value) => /submit application live belum terlihat|submit final belum boleh diasumsikan/i.test(value)), true);
});

test("success fixture matches success with Nice work marker", () => {
  const html = readFixture("application-sent.html");
  const normalized = normalizeForMatcher(
    createSnapshot(
      "https://id.jobstreet.com/job/92191658/apply/success",
      "Application sent - Jobstreet",
      html,
      [],
    ),
  );

  const result = matchLiveSnapshotToJobstreetKnowledge(normalized, normalized.url);
  assert.equal(result.step, "success");
  assert.equal(result.confidence >= 0.7, true);
  assert.equal(result.matchedSignals.some((value) => /marker sukses cocok/i.test(value)), true);
});
