import { describe, it } from "node:test";
import assert from "node:assert";
import { isTerminalCampaignStep, TERMINAL_CAMPAIGN_STEPS } from "../lib/campaign/campaign-state";

describe("campaign-state", () => {
  it("TERMINAL_CAMPAIGN_STEPS contains expected steps", () => {
    assert.deepStrictEqual(TERMINAL_CAMPAIGN_STEPS, [
      "no_jobs_remaining",
      "target_reached",
      "too_many_unusable_jobs",
    ]);
  });

  it("isTerminalCampaignStep returns true for terminal steps", () => {
    assert.strictEqual(isTerminalCampaignStep("no_jobs_remaining"), true);
    assert.strictEqual(isTerminalCampaignStep("target_reached"), true);
    assert.strictEqual(isTerminalCampaignStep("too_many_unusable_jobs"), true);
  });

  it("isTerminalCampaignStep returns false for non-terminal steps", () => {
    assert.strictEqual(isTerminalCampaignStep("searching_jobs"), false);
    assert.strictEqual(isTerminalCampaignStep("scoring_job"), false);
    assert.strictEqual(isTerminalCampaignStep("decision_required"), false);
    assert.strictEqual(isTerminalCampaignStep("opening_job"), false);
    assert.strictEqual(isTerminalCampaignStep("apply_paused"), false);
    assert.strictEqual(isTerminalCampaignStep("manual_intervention"), false);
    assert.strictEqual(isTerminalCampaignStep(""), false);
  });

  it("isTerminalCampaignStep handles null and undefined", () => {
    assert.strictEqual(isTerminalCampaignStep(null), false);
    assert.strictEqual(isTerminalCampaignStep(undefined), false);
  });
});
