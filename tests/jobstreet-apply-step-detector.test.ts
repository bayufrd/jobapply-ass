import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectJobstreetApplyStep } from "../lib/browser/jobstreet-apply-step-detector.ts";
import {
  detectManualInterventionFromSignals,
  shouldPauseForManualIntervention,
  type VisiblePageSignals,
} from "../lib/browser/page-detector.ts";

test("detects choose documents URL", () => {
  assert.equal(
    detectJobstreetApplyStep("https://www.jobstreet.co.id/job/92275484/apply?sol=abc"),
    "choose_documents",
  );
});

test("detects employer questions URL", () => {
  assert.equal(
    detectJobstreetApplyStep("https://www.jobstreet.co.id/job/92275484/apply/role-requirements?sol=abc"),
    "employer_questions",
  );
});

test("detects update profile URL", () => {
  assert.equal(
    detectJobstreetApplyStep("https://www.jobstreet.co.id/job/92275484/apply/profile?sol=abc"),
    "update_profile",
  );
  assert.equal(
    detectJobstreetApplyStep("https://www.jobstreet.co.id/job/92231298/apply/profile?sol=abc"),
    "update_profile",
  );
});

test("detects review submit URL", () => {
  assert.equal(
    detectJobstreetApplyStep("https://www.jobstreet.co.id/job/92275484/apply/review?sol=abc"),
    "review_submit",
  );
});

test("detects success URL", () => {
  assert.equal(
    detectJobstreetApplyStep("https://www.jobstreet.co.id/job/92191658/apply/success"),
    "success",
  );
});

function createSignals(input: Partial<VisiblePageSignals>): VisiblePageSignals {
  return {
    visibleText: "",
    interactiveTexts: [],
    hasVisiblePasswordInput: false,
    hasVisibleOtpInput: false,
    hasVisibleCaptcha: false,
    hasVisibleLoginButton: false,
    ...input,
  };
}

test("does not flag manual intervention on update profile page with normal profile text", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/job/92231298/apply/profile?sol=abc",
    createSignals({ visibleText: "update jobstreet profile" }),
  );

  assert.equal(detectJobstreetApplyStep("https://id.jobstreet.com/job/92231298/apply/profile?sol=abc", "Update Jobstreet Profile"), "update_profile");
  assert.equal(result.detected, false);
  assert.equal(shouldPauseForManualIntervention(result), false);
});

test("does not flag manual intervention on update profile page with avatar and open app text", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/job/92231298/apply/profile?sol=abc",
    createSignals({ visibleText: "profile avatar open app jobstreet", interactiveTexts: ["open app"] }),
  );

  assert.equal(result.detected, false);
  assert.equal(shouldPauseForManualIntervention(result), false);
});

test("does not flag manual intervention on update profile page with weak sign-in markers only", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/job/92231298/apply/profile?sol=abc",
    createSignals({
      visibleText: "update jobstreet profile your jobstreet profile sign_in_page /oauth/login profile avatar open app",
      interactiveTexts: ["open app", "profile"],
    }),
  );

  assert.equal(result.detected, false);
  assert.equal(shouldPauseForManualIntervention(result), false);
});

test("does not flag manual intervention on update profile page with normal visible profile copy", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/job/92231298/apply/profile?sol=abc",
    createSignals({
      visibleText: "Skip to content Your Jobstreet Profile is part of your application Make sure it's up-to-date Profile Avatar SIGN_IN_PAGE",
      interactiveTexts: ["continue", "skip to content"],
    }),
  );

  assert.equal(detectJobstreetApplyStep("https://id.jobstreet.com/job/92231298/apply/profile?sol=abc"), "update_profile");
  assert.equal(result.detected, false);
  assert.equal(shouldPauseForManualIntervention(result), false);
});

test("flags OTP on update profile page only when strong visible evidence exists", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/job/92231298/apply/profile?sol=abc",
    createSignals({ visibleText: "enter verification code", hasVisibleOtpInput: true }),
  );

  assert.equal(result.detected, true);
  assert.equal(result.type, "otp");
  assert.equal(shouldPauseForManualIntervention(result), true);
});

test("flags login on oauth page with visible password input", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/oauth/login",
    createSignals({ visibleText: "sign in to your account", hasVisiblePasswordInput: true, hasVisibleLoginButton: true }),
  );

  assert.equal(result.detected, true);
  assert.equal(result.type, "login");
  assert.equal(shouldPauseForManualIntervention(result), true);
});

test("does not flag manual intervention on review page with submit application button", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/job/92231298/apply/review?sol=abc",
    createSignals({ visibleText: "submit application", interactiveTexts: ["submit application"] }),
  );

  assert.equal(detectJobstreetApplyStep("https://id.jobstreet.com/job/92231298/apply/review?sol=abc", "Submit application"), "review_submit");
  assert.equal(result.detected, false);
  assert.equal(shouldPauseForManualIntervention(result), false);
});

test("detects success from marker text", () => {
  assert.equal(
    detectJobstreetApplyStep("https://www.jobstreet.co.id/job/92191658/summary", "Nice work"),
    "success",
  );
  assert.equal(
    detectJobstreetApplyStep("https://www.jobstreet.co.id/job/92191658/summary", "Your application has been sent"),
    "success",
  );
});

test("fixture pages are present with expected markers", () => {
  const successHtml = readFileSync(resolve("tests/fixtures/jobstreet/application-sent.html"), "utf8");
  const reviewHtml = readFileSync(resolve("tests/fixtures/jobstreet/review-and-submit.html"), "utf8");

  assert.match(successHtml, /Nice work/i);
  assert.match(successHtml, /Your application has been sent/i);
  assert.match(reviewHtml, /Submit application/i);
});

