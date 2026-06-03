import test from "node:test";
import assert from "node:assert/strict";
import { buildJobstreetSearchUrl, getJobstreetLocationSlug } from "../lib/jobstreet/jobstreet-search-url.ts";

test("uses hardcoded Jakarta Barat location slug", () => {
  assert.equal(getJobstreetLocationSlug(), "Jakarta-Barat-Jakarta-Raya");
});

test("builds search URL for .net", () => {
  assert.equal(
    buildJobstreetSearchUrl(".net"),
    "https://id.jobstreet.com/id/.net-jobs/in-Jakarta-Barat-Jakarta-Raya",
  );
});

test("builds search URL for fullstack developer", () => {
  assert.equal(
    buildJobstreetSearchUrl("fullstack developer"),
    "https://id.jobstreet.com/id/fullstack-developer-jobs/in-Jakarta-Barat-Jakarta-Raya",
  );
});

test("builds search URL for backend developer", () => {
  assert.equal(
    buildJobstreetSearchUrl("backend developer"),
    "https://id.jobstreet.com/id/backend-developer-jobs/in-Jakarta-Barat-Jakarta-Raya",
  );
});

test("builds search URL for react", () => {
  assert.equal(
    buildJobstreetSearchUrl("react"),
    "https://id.jobstreet.com/id/react-jobs/in-Jakarta-Barat-Jakarta-Raya",
  );
});

test("page 1 has no page query", () => {
  assert.equal(
    buildJobstreetSearchUrl("backend developer", 1),
    "https://id.jobstreet.com/id/backend-developer-jobs/in-Jakarta-Barat-Jakarta-Raya",
  );
});

test("page 2 adds page query", () => {
  assert.equal(
    buildJobstreetSearchUrl("backend developer", 2),
    "https://id.jobstreet.com/id/backend-developer-jobs/in-Jakarta-Barat-Jakarta-Raya?page=2",
  );
});
