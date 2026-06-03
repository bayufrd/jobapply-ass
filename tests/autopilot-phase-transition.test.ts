import test from "node:test";
import assert from "node:assert/strict";
import { jsonControlled, jsonOk } from "../lib/api/json-response.ts";
import {
  AUTO_APPLY_FALLBACK_JOB_STATUSES,
  PICKABLE_JOB_STATUSES,
} from "../lib/campaign/job-status.ts";

function buildSearchCompletedResponse(input?: Partial<{
  foundCount: number;
  savedCount: number;
  scoredCount: number;
  scoringFailedCount: number;
}>) {
  const foundCount = input?.foundCount ?? 20;
  const savedCount = input?.savedCount ?? foundCount;
  const scoredCount = input?.scoredCount ?? 0;
  const scoringFailedCount = input?.scoringFailedCount ?? foundCount - scoredCount;

  return {
    status: "search_continue",
    message: "Fase pencarian selesai. Melanjutkan ke fase apply...",
    campaignId: "cmp-test",
    currentStep: "search_completed",
    canContinue: true,
    nextAction: "continue_autopilot" as const,
    nextStep: "apply",
    searchSummary: {
      foundCount,
      savedCount,
      scoredCount,
      scoringFailedCount,
    },
  };
}

function buildEligibleStatusList(input: {
  lowScoreMode?: string | null;
  shortlistedCount?: number;
}) {
  const forceApplyLowScore = input.lowScoreMode === "auto_apply";
  return Array.from(new Set([
    ...(forceApplyLowScore || (input.shortlistedCount ?? 0) === 0 ? AUTO_APPLY_FALLBACK_JOB_STATUSES : []),
    ...PICKABLE_JOB_STATUSES.filter((status) => status !== "skipped"),
    "applying",
  ]));
}

test("search completed payload returns canContinue and nextAction", async () => {
  const response = jsonOk(buildSearchCompletedResponse());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "search_continue");
  assert.equal(body.currentStep, "search_completed");
  assert.equal(body.canContinue, true);
  assert.equal(body.nextAction, "continue_autopilot");
  assert.equal(body.nextStep, "apply");
  assert.deepEqual(body.searchSummary, {
    foundCount: 20,
    savedCount: 20,
    scoredCount: 0,
    scoringFailedCount: 20,
  });
});

test("search completed runner payload is always defined", () => {
  const result = buildSearchCompletedResponse({ foundCount: 12, savedCount: 10, scoredCount: 3, scoringFailedCount: 7 });

  assert.ok(result);
  assert.equal(typeof result.message, "string");
  assert.notEqual(result.message.length, 0);
  assert.equal(result.currentStep, "search_completed");
});

test("auto apply mode keeps discovered jobs eligible when scoring fails", () => {
  const statuses = buildEligibleStatusList({ lowScoreMode: "auto_apply", shortlistedCount: 0 });

  assert.equal(statuses.includes("discovered"), true);
  assert.equal(statuses.includes("shortlisted"), true);
  assert.equal(statuses.includes("applying"), true);
});

test("no eligible jobs can return controlled json instead of empty body", async () => {
  const response = jsonControlled({
    status: "completed",
    currentStep: "no_jobs_remaining_after_all_pages",
    message: "Tidak ada lowongan eligible untuk dilamar. Cek status scoring dan mode lowScoreMode.",
    campaignId: "cmp-test",
    canContinue: false,
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.controlled, true);
  assert.equal(body.message, "Tidak ada lowongan eligible untuk dilamar. Cek status scoring dan mode lowScoreMode.");
});
