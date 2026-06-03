import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSafeUrl } from "../lib/jobstreet/safe-url.ts";

test("rejects empty string", () => {
  const result = normalizeSafeUrl("   ");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "empty_url");
});

test("rejects null", () => {
  const result = normalizeSafeUrl(null);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unsupported_type");
});

test("resolves relative job detail URL to Jobstreet", () => {
  const result = normalizeSafeUrl("/id/job/92277246", {
    defaultBaseUrl: "https://id.jobstreet.com",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.url, "https://id.jobstreet.com/id/job/92277246");
  assert.equal(result.isJobstreet, true);
  assert.equal(result.isExternal, false);
});

test("resolves relative apply URL to Jobstreet", () => {
  const result = normalizeSafeUrl("/id/job/92277246/apply", {
    defaultBaseUrl: "https://id.jobstreet.com",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.url, "https://id.jobstreet.com/id/job/92277246/apply");
  assert.equal(result.isJobstreet, true);
});

test("accepts absolute Jobstreet URL", () => {
  const result = normalizeSafeUrl("https://id.jobstreet.com/id/job/92277246/apply/profile");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.hostname, "id.jobstreet.com");
  assert.equal(result.isJobstreet, true);
});

test("accepts external https URL only when allowExternal true", () => {
  const rejected = normalizeSafeUrl("https://example.com/apply", {
    allowExternal: false,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "invalid_url");

  const accepted = normalizeSafeUrl("https://example.com/apply", {
    allowExternal: true,
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.isExternal, true);
  assert.equal(accepted.isJobstreet, false);
});

test("rejects javascript URL", () => {
  const result = normalizeSafeUrl("javascript:alert(1)");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "blocked_protocol");
});

test("rejects mailto URL", () => {
  const result = normalizeSafeUrl("mailto:test@example.com");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "blocked_protocol");
});

test("rejects tel URL", () => {
  const result = normalizeSafeUrl("tel:+62123456789");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "blocked_protocol");
});

test("rejects malformed URL", () => {
  const result = normalizeSafeUrl("ht!tp://bad url");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_url");
});
