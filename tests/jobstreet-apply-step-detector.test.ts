import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectJobstreetApplyStep } from "../lib/browser/jobstreet-apply-step-detector.ts";
import { detectApplicationSuccessMarker } from "../lib/browser/success-markers.ts";
import {
  detectManualInterventionFromSignals,
  shouldPauseForManualIntervention,
  type VisiblePageSignals,
} from "../lib/browser/page-detector.ts";

test("detects /apply URL", () => {
  assert.equal(
    detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92275484/apply?sol=abc"),
    "apply",
  );
});

test("detects /apply/role-requirements URL", () => {
  assert.equal(
    detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92275484/apply/role-requirements?sol=abc"),
    "role-requirements",
  );
});

test("detects /apply/profile URL", () => {
  assert.equal(
    detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92275484/apply/profile?sol=abc"),
    "profile",
  );
  assert.equal(
    detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92231298/apply/profile?sol=abc"),
    "profile",
  );
});

test("detects /apply/review URL", () => {
  assert.equal(
    detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92275484/apply/review?sol=abc"),
    "review",
  );
});

test("detects /apply/success URL", () => {
  assert.equal(
    detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92191658/apply/success"),
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

test("does not flag manual intervention on profile page with normal profile text", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/id/job/92231298/apply/profile?sol=abc",
    createSignals({ visibleText: "update jobstreet profile" }),
  );

  assert.equal(detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92231298/apply/profile?sol=abc", "Update Jobstreet Profile"), "profile");
  assert.equal(result.detected, false);
  assert.equal(shouldPauseForManualIntervention(result), false);
});

test("does not flag manual intervention on profile page with avatar and open app text", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/id/job/92231298/apply/profile?sol=abc",
    createSignals({ visibleText: "profile avatar open app jobstreet", interactiveTexts: ["open app"] }),
  );

  assert.equal(result.detected, false);
  assert.equal(shouldPauseForManualIntervention(result), false);
});

test("does not flag manual intervention on profile page with weak sign-in markers only", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/id/job/92231298/apply/profile?sol=abc",
    createSignals({
      visibleText: "update jobstreet profile your jobstreet profile sign_in_page /oauth/login profile avatar open app",
      interactiveTexts: ["open app", "profile"],
    }),
  );

  assert.equal(result.detected, false);
  assert.equal(shouldPauseForManualIntervention(result), false);
});

test("does not flag manual intervention on profile page with normal visible profile copy", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/id/job/92231298/apply/profile?sol=abc",
    createSignals({
      visibleText: "Skip to content Your Jobstreet Profile is part of your application Make sure it's up-to-date Profile Avatar SIGN_IN_PAGE",
      interactiveTexts: ["continue", "skip to content"],
    }),
  );

  assert.equal(detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92231298/apply/profile?sol=abc"), "profile");
  assert.equal(result.detected, false);
  assert.equal(shouldPauseForManualIntervention(result), false);
});

test("flags OTP on profile page only when strong visible evidence exists", () => {
  const result = detectManualInterventionFromSignals(
    "https://id.jobstreet.com/id/job/92231298/apply/profile?sol=abc",
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
    "https://id.jobstreet.com/id/job/92231298/apply/review?sol=abc",
    createSignals({ visibleText: "submit application", interactiveTexts: ["submit application"] }),
  );

  assert.equal(detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92231298/apply/review?sol=abc", "Submit application"), "review");
  assert.equal(result.detected, false);
  assert.equal(shouldPauseForManualIntervention(result), false);
});

test("detects success from marker text", () => {
  assert.equal(
    detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92191658/summary", "Nice work"),
    "success",
  );
  assert.equal(
    detectJobstreetApplyStep("https://id.jobstreet.com/id/job/92191658/summary", "Your application has been sent"),
    "success",
  );
});

test("success marker matches /apply/success URL", () => {
  assert.deepEqual(detectApplicationSuccessMarker({ url: "https://id.jobstreet.com/id/job/92191658/apply/success" }), {
    matched: true,
    marker: "/apply/success",
    source: "url",
  });
});

test("success marker matches success text", () => {
  const result = detectApplicationSuccessMarker({ text: "Your application has been sent" });
  assert.equal(result.matched, true);
  assert.equal(result.marker, "Your application has been sent");
  assert.equal(result.source, "text");
});

test("false success does not match and must not increment count", () => {
  assert.deepEqual(detectApplicationSuccessMarker({ url: "https://id.jobstreet.com/id/job/92191658/apply/review", text: "Review your application" }), {
    matched: false,
    marker: null,
    source: null,
  });
});

test("fixture pages are present with expected markers", () => {
  const successHtml = readFileSync(resolve("tests/fixtures/jobstreet/application-sent.html"), "utf8");
  const reviewHtml = readFileSync(resolve("tests/fixtures/jobstreet/review-and-submit.html"), "utf8");

  assert.match(successHtml, /Nice work/i);
  assert.match(successHtml, /Your application has been sent/i);
  assert.match(reviewHtml, /Submit application/i);
});
