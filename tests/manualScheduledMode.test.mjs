import test from "node:test";
import assert from "node:assert/strict";
import { resolveManualScheduledMode } from "../src/manualScheduledMode.js";

test("manual opportunity request can split the free-tier batch", () => {
  assert.equal(resolveManualScheduledMode("/testTriggerScheduledOpportunity", "opportunity"), "opportunity");
  assert.equal(resolveManualScheduledMode("/testTriggerScheduledOpportunity", "opportunity-batch"), "opportunity-batch");
  assert.equal(resolveManualScheduledMode("/testTriggerScheduledProjectOpportunity", "project-opportunity"), "project-opportunity");
});
