import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDailyPromptItemCap,
  selectDailyPromptItems,
} from "../src/dailyPromptSelection.js";

test("resolveDailyPromptItemCap uses scheduled cap by default", () => {
  assert.equal(resolveDailyPromptItemCap({ DAILY_PROMPT_ITEM_CAP: "6" }), 6);
});

test("resolveDailyPromptItemCap uses manual cap for dated manual runs", () => {
  assert.equal(
    resolveDailyPromptItemCap({
      DAILY_PROMPT_ITEM_CAP: "8",
      MANUAL_DAILY_PROMPT_ITEM_CAP: "4",
    }, true),
    4
  );
});

test("resolveDailyPromptItemCap falls back to 8 for invalid values", () => {
  assert.equal(resolveDailyPromptItemCap({ DAILY_PROMPT_ITEM_CAP: "0" }), 8);
  assert.equal(resolveDailyPromptItemCap({ DAILY_PROMPT_ITEM_CAP: "abc" }), 8);
});

test("selectDailyPromptItems prioritizes media items and caps total size", () => {
  assert.deepEqual(
    selectDailyPromptItems(["m1", "m2"], ["n1", "n2", "n3"], 4),
    ["m1", "m2", "n1", "n2"]
  );
});
