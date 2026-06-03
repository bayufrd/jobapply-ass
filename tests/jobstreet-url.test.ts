import test from "node:test";
import assert from "node:assert/strict";
import { buildJobstreetApplyUrl, extractJobstreetJobId } from "../lib/jobstreet/jobstreet-url.ts";

test("extracts Jobstreet job ID from detail URL", () => {
  assert.equal(extractJobstreetJobId("https://id.jobstreet.com/id/job/92277246"), "92277246");
});

test("extracts Jobstreet job ID from relative detail URL", () => {
  assert.equal(extractJobstreetJobId("/id/job/92277246"), "92277246");
});

test("extracts Jobstreet job ID from detail URL with query", () => {
  assert.equal(extractJobstreetJobId("https://id.jobstreet.com/id/job/92277246?type=standard"), "92277246");
});

test("extracts Jobstreet job ID from apply URL", () => {
  assert.equal(extractJobstreetJobId("https://id.jobstreet.com/id/job/92277246/apply"), "92277246");
});

test("extracts Jobstreet job ID from role requirements URL", () => {
  assert.equal(extractJobstreetJobId("https://id.jobstreet.com/id/job/92277246/apply/role-requirements"), "92277246");
});

test("extracts Jobstreet job ID from profile URL", () => {
  assert.equal(extractJobstreetJobId("https://id.jobstreet.com/id/job/92277246/apply/profile"), "92277246");
});

test("extracts Jobstreet job ID from review URL", () => {
  assert.equal(extractJobstreetJobId("https://id.jobstreet.com/id/job/92277246/apply/review"), "92277246");
});

test("extracts Jobstreet job ID from success URL", () => {
  assert.equal(extractJobstreetJobId("https://id.jobstreet.com/id/job/92277246/apply/success"), "92277246");
});

test("returns null for non-Jobstreet job URL", () => {
  assert.equal(extractJobstreetJobId("https://example.com/jobs/92277246"), null);
});

test("builds fallback apply URL", () => {
  assert.equal(buildJobstreetApplyUrl("92277246"), "https://id.jobstreet.com/id/job/92277246/apply");
});

test("builds role requirements URL", () => {
  assert.equal(buildJobstreetApplyUrl("92277246", "role-requirements"), "https://id.jobstreet.com/id/job/92277246/apply/role-requirements");
});

test("builds profile URL", () => {
  assert.equal(buildJobstreetApplyUrl("92277246", "profile"), "https://id.jobstreet.com/id/job/92277246/apply/profile");
});

test("builds review URL", () => {
  assert.equal(buildJobstreetApplyUrl("92277246", "review"), "https://id.jobstreet.com/id/job/92277246/apply/review");
});

test("builds success URL", () => {
  assert.equal(buildJobstreetApplyUrl("92277246", "success"), "https://id.jobstreet.com/id/job/92277246/apply/success");
});
