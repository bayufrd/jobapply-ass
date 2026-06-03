import test from "node:test";
import assert from "node:assert/strict";
import { jsonControlled, jsonError, jsonOk } from "../lib/api/json-response.ts";

test("jsonOk returns ok true payload", async () => {
  const response = jsonOk({ status: "running", message: "Autopilot berjalan." });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "running");
  assert.equal(body.message, "Autopilot berjalan.");
});

test("jsonError returns ok false payload", async () => {
  const response = jsonError("empty_response_body", "Server mengembalikan response kosong.", { actionName: "poll_status" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.error, "empty_response_body");
  assert.equal(body.message, "Server mengembalikan response kosong.");
  assert.equal(body.actionName, "poll_status");
});

test("jsonControlled returns controlled payload", async () => {
  const response = jsonControlled({ status: "paused", currentStep: "question_required", message: "Menunggu jawaban user." });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.controlled, true);
  assert.equal(body.status, "paused");
  assert.equal(body.currentStep, "question_required");
  assert.equal(body.message, "Menunggu jawaban user.");
});
