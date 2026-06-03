import test from "node:test";
import assert from "node:assert/strict";
import { safeJsonParse } from "../lib/utils/safe-json.ts";

test("empty string returns fallback", () => {
  assert.deepEqual(safeJsonParse("", { ok: false }), { ok: false });
});

test("whitespace returns fallback", () => {
  assert.deepEqual(safeJsonParse("   ", ["fallback"]), ["fallback"]);
});

test("invalid JSON returns fallback", () => {
  assert.deepEqual(safeJsonParse("{bad json", { fallback: true }), { fallback: true });
});

test("valid JSON parsed", () => {
  assert.deepEqual(safeJsonParse('{"ok":true,"items":[1,2]}', null), { ok: true, items: [1, 2] });
});

test("non-string returns fallback", () => {
  assert.equal(safeJsonParse(undefined, 42), 42);
});
