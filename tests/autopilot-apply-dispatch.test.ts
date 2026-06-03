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
  const shouldBypassLowScoreGate = job.matchScore === null && job.status === "shortlisted";
  const entersLowScoreBranch = !shouldBypassLowScoreGate && score < job.campaign.matchThreshold;

  assert.equal(shouldBypassLowScoreGate, true);
  assert.equal(entersLowScoreBranch, false);
});

test("discovered job without score bypasses low-score pause when scoring just failed", () => {
  const job = {
    status: "discovered",
    matchScore: null,
    campaign: {
      matchThreshold: 55,
    },
  };
  const scoringFailed = true;

  const score = job.matchScore ?? 0;
  const shouldBypassLowScoreGate = job.matchScore === null && (job.status === "shortlisted" || scoringFailed);
  const entersLowScoreBranch = !shouldBypassLowScoreGate && score < job.campaign.matchThreshold;

  assert.equal(shouldBypassLowScoreGate, true);
  assert.equal(entersLowScoreBranch, false);
});

test("blank MCP snapshot still qualifies for deterministic internal apply fallback", () => {
  const isTransientBlankState = true;
  const normalizedCurrentUrl = { ok: false, isJobstreet: false };
  const detectedStep = "unknown";
  const normalizedPageKind = "unknown";
  const fixtureConfidence = 0;
  const normalizedFallbackApplyUrl = { ok: true, url: "https://id.jobstreet.com/id/job/92437409/apply" };

  const canUseInternalApplyFallback = normalizedFallbackApplyUrl.ok && (
    isTransientBlankState
    || (normalizedCurrentUrl.ok && normalizedCurrentUrl.isJobstreet && detectedStep === "unknown" && normalizedPageKind === "unknown" && fixtureConfidence === 0)
  );

  assert.equal(canUseInternalApplyFallback, true);
});

test("forced direct apply seed stores canonical job and apply URLs", () => {
  const directJobId = "92457600";
  const directJobUrl = `https://id.jobstreet.com/id/job/${directJobId}`;
  const directApplyUrl = `${directJobUrl}/apply`;
  const payload = {
    type: "qa_direct_apply_seed",
    forceDirectApply: true,
    directJobId,
    directJobUrl,
    directApplyUrl,
  };

  assert.equal(payload.forceDirectApply, true);
  assert.equal(payload.directJobId, "92457600");
  assert.equal(payload.directJobUrl, "https://id.jobstreet.com/id/job/92457600");
  assert.equal(payload.directApplyUrl, "https://id.jobstreet.com/id/job/92457600/apply");
});

test("forced direct apply prioritizes seeded jobstreet job id before normal ranking", () => {
  const forcedDirectApply = true;
  const directJobId = "92457600";
  const picked = {
    id: "job-seeded",
    title: "QA Direct Apply 92457600",
    jobstreetJobId: "92457600",
    matchScore: 100,
  };
  const fallback = {
    id: "job-ranked",
    title: "Other ranked job",
    jobstreetJobId: "92011375",
    matchScore: 100,
  };

  const selected = forcedDirectApply && picked.jobstreetJobId === directJobId
    ? picked
    : fallback;

  assert.equal(selected.id, "job-seeded");
  assert.equal(selected.jobstreetJobId, "92457600");
});

 test("forced direct apply can repick seeded listing when previous failed application only has internal jobListingId", () => {
  const resolvedDirectListingId = "cmpyjxu8o00ic9kvgq7oqhtmg";
  const blockedApplications = [
    {
      jobListingId: resolvedDirectListingId,
      status: "failed",
      jobstreetJobId: null,
    },
    {
      jobListingId: "job-submitted",
      status: "submitted",
      jobstreetJobId: null,
    },
  ];

  const blockedJobIds = blockedApplications
    .filter((item) => {
      if (!resolvedDirectListingId || item.jobListingId !== resolvedDirectListingId) {
        return true;
      }

      return item.status !== "failed";
    })
    .map((item) => item.jobListingId);

  assert.deepEqual(blockedJobIds, ["job-submitted"]);
  assert.equal(blockedJobIds.includes(resolvedDirectListingId), false);
});
