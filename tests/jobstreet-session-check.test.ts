import test from "node:test";
import assert from "node:assert/strict";
import { analyzeJobstreetSessionSnapshot, getDefaultJobstreetSessionCheckUrl } from "../lib/jobstreet/session-check.ts";

function createSnapshot(input = {}) {
  return {
    url: "https://id.jobstreet.com/id/job/92457600",
    title: "Lowongan QA Direct Apply",
    accessibilityText: "Detail pekerjaan Jobstreet",
    rawText: "",
    elements: [],
    ...input,
  };
}

test("returns default direct QA URL for session check", () => {
  assert.equal(getDefaultJobstreetSessionCheckUrl(), "https://id.jobstreet.com/id/job/92457600");
});

test("detects login_required from oauth login evidence", () => {
  const result = analyzeJobstreetSessionSnapshot(createSnapshot({
    accessibilityText: "Masuk untuk melanjutkan",
    rawText: "/id/oauth/login?returnUrl=%2Fid%2Fjob%2F92457600",
  }));

  assert.equal(result.state, "login_required");
  assert.equal(result.canResumeAutopilot, false);
  assert.equal(result.loginUrlDetected, true);
});

test("detects authenticated state from internal apply URL", () => {
  const result = analyzeJobstreetSessionSnapshot(createSnapshot({
    url: "https://id.jobstreet.com/id/job/92457600/apply",
    accessibilityText: "Choose documents Continue",
  }));

  assert.equal(result.state, "authenticated");
  assert.equal(result.applyUrlDetected, true);
  assert.equal(result.canResumeAutopilot, true);
});

test("detects otp_required from OTP evidence", () => {
  const result = analyzeJobstreetSessionSnapshot(createSnapshot({
    accessibilityText: "Enter verification code",
    rawText: "OTP",
  }));

  assert.equal(result.state, "otp_required");
  assert.equal(result.visibleBrowserRequired, true);
  assert.equal(result.canResumeAutopilot, false);
});

test("detects security_or_challenge from captcha evidence", () => {
  const result = analyzeJobstreetSessionSnapshot(createSnapshot({
    accessibilityText: "Please complete captcha",
    rawText: "I'm not a robot",
  }));

  assert.equal(result.state, "security_or_challenge");
  assert.equal(result.visibleBrowserRequired, true);
  assert.equal(result.canResumeAutopilot, false);
});

test("keeps blank snapshot as unknown and non-resumable until recovery navigate happens elsewhere", () => {
  const result = analyzeJobstreetSessionSnapshot(createSnapshot({
    url: "about:blank",
    title: "",
    accessibilityText: "",
    rawText: "",
    elements: [],
  }));

  assert.equal(result.state, "unknown");
  assert.equal(result.currentUrl, "about:blank");
  assert.equal(result.canResumeAutopilot, false);
});
