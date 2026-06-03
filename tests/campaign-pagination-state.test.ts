import test from "node:test";
import assert from "node:assert/strict";
import { resolveCampaignPaginationDecision } from "../lib/campaign/campaign-pagination-state.ts";

test("page exhausted advances to page 2", () => {
  const result = resolveCampaignPaginationDecision(
    {
      currentSearchPage: 1,
      emptyPageCount: 0,
      verifiedSubmittedCount: 0,
      targetApplyCount: 100,
    },
    {
      pageHadProcessableJobs: true,
      shouldAdvancePage: true,
    },
  );

  assert.deepEqual(result, {
    type: "advance_to_next_page",
    currentSearchPage: 1,
    nextSearchPage: 2,
    emptyPageCount: 0,
  });
});

test("empty pages stop after maxConsecutiveEmptyPages", () => {
  const result = resolveCampaignPaginationDecision(
    {
      currentSearchPage: 3,
      emptyPageCount: 2,
      verifiedSubmittedCount: 0,
      targetApplyCount: 100,
      maxConsecutiveEmptyPages: 3,
    },
    {
      pageHadProcessableJobs: false,
      shouldAdvancePage: true,
    },
  );

  assert.deepEqual(result, {
    type: "too_many_empty_pages",
    currentSearchPage: 3,
    emptyPageCount: 3,
  });
});

test("target reached returns terminal state", () => {
  const result = resolveCampaignPaginationDecision(
    {
      currentSearchPage: 4,
      emptyPageCount: 1,
      verifiedSubmittedCount: 5,
      targetApplyCount: 5,
    },
    {
      pageHadProcessableJobs: true,
      shouldAdvancePage: true,
    },
  );

  assert.deepEqual(result, {
    type: "target_reached",
    currentSearchPage: 4,
    emptyPageCount: 1,
  });
});
