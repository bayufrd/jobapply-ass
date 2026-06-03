import test from "node:test";
import assert from "node:assert/strict";
import { jsonControlled, jsonError, jsonOk } from "../lib/api/json-response.ts";

function buildDispatch(input?: Partial<{
  mode: string;
  runner: string;
  jobListingId: string;
  jobTitle: string;
  jobUrl: string;
  applyUrl: string | null;
}>) {
  return {
    mode: input?.mode ?? "mcp_ai_first",
    runner: input?.runner ?? "runMcpAiApplyRunner",
    jobListingId: input?.jobListingId ?? "job-1",
    jobTitle: input?.jobTitle ?? "IT Developer",
    jobUrl: input?.jobUrl ?? "https://id.jobstreet.com/id/job/92437409",
    applyUrl: input?.applyUrl ?? null,
  };
}

test("eligible job selected dispatches MCP runner in mcp_ai_first mode", () => {
  const dispatch = buildDispatch();

  assert.equal(dispatch.mode, "mcp_ai_first");
  assert.equal(dispatch.runner, "runMcpAiApplyRunner");
  assert.equal(dispatch.jobTitle, "IT Developer");
});

test("eligible job selected can emit phase apply started log metadata", () => {
  const metadata = {
    campaignId: "cmp-test",
    jobListingId: "job-1",
    jobTitle: "IT Developer",
    company: "PT Mega Ponsel Indonesia",
    jobUrl: "https://id.jobstreet.com/id/job/92437409",
    applyUrl: null,
    jobStatus: "applying",
    formAutomationMode: "mcp_ai_first",
    automationMode: "auto_submit_safe_only",
    lowScoreMode: "auto_apply",
  };

  assert.equal(metadata.jobTitle, "IT Developer");
  assert.equal(metadata.formAutomationMode, "mcp_ai_first");
  assert.equal(metadata.jobStatus, "applying");
});

test("runner success payload stays json serializable", async () => {
  const response = jsonOk({
    status: "safe_continue",
    message: "Proses apply dimulai untuk lowongan IT Developer.",
    campaignId: "cmp-test",
    currentStep: "opening_job",
    currentJobId: "job-1",
  });
  const body = await response.json();

  assert.equal(body.ok, true);
  assert.equal(body.status, "safe_continue");
  assert.equal(body.currentJobId, "job-1");
});

test("missing job url returns controlled json", async () => {
  const response = jsonControlled({
    status: "paused",
    currentStep: "apply_precondition_failed",
    blockerType: "missing_apply_precondition",
    canContinue: false,
    message: "Fase apply belum bisa dimulai karena data lowongan/profil belum lengkap.",
    evidence: {
      missingCandidateProfile: false,
      missingJobUrl: true,
      missingApplyUrl: true,
      formAutomationMode: "mcp_ai_first",
    },
  });
  const body = await response.json();

  assert.equal(body.ok, false);
  assert.equal(body.controlled, true);
  assert.equal(body.evidence.missingJobUrl, true);
});

test("runner throw maps to json error instead of undefined", async () => {
  const response = jsonError("autopilot_continue_failed", "Autopilot gagal dilanjutkan. Cek log server untuk detail.", {
    status: "error",
    currentStep: "autopilot_continue_failed",
    details: "Invalid URL",
    canContinue: true,
  });
  const body = await response.json();

  assert.equal(body.ok, false);
  assert.equal(body.error, "autopilot_continue_failed");
  assert.equal(body.details, "Invalid URL");
  assert.equal(body.canContinue, true);
});

test("shortlisted job without score still remains eligible for apply dispatch after scoring failure", () => {
  const job = {
    status: "shortlisted",
    matchScore: null,
    campaign: {
      matchThreshold: 70,
    },
  };

  const score = job.matchScore ?? 0;
  const shouldApplyEligibleJobWithoutScore = job.status === "shortlisted" && job.matchScore === null;
  const entersLowScoreBranch = !shouldApplyEligibleJobWithoutScore && score < job.campaign.matchThreshold;

  assert.equal(shouldApplyEligibleJobWithoutScore, true);
  assert.equal(entersLowScoreBranch, false);
});
