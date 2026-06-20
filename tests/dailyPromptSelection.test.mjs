import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDailyPromptItemCap,
  resolveDailySourceCaps,
  selectDailyPromptCandidates,
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

test("resolveDailySourceCaps reads per-source caps", () => {
  assert.deepEqual(
    resolveDailySourceCaps({
      DAILY_NEWS_ITEM_CAP: "5",
      DAILY_PAPER_ITEM_CAP: "2",
      DAILY_PROJECT_ITEM_CAP: "1",
      DAILY_SOCIAL_ITEM_CAP: "3",
    }),
    { news: 5, paper: 2, project: 1, socialMedia: 3 }
  );
});

test("resolveDailySourceCaps defaults give papers enough room for BioAI daily", () => {
  assert.deepEqual(resolveDailySourceCaps({}), {
    news: 8,
    paper: 8,
    project: 4,
    socialMedia: 2,
  });
});

test("selectDailyPromptCandidates keeps source variety", () => {
  const candidates = [
    { key: "p1", text: "paper 1", sourceType: "paper", publishedDate: "2026-06-09T03:00:00Z" },
    { key: "p2", text: "paper 2", sourceType: "paper", publishedDate: "2026-06-09T02:00:00Z" },
    { key: "p3", text: "paper 3", sourceType: "paper", publishedDate: "2026-06-09T01:00:00Z" },
    { key: "n1", text: "news 1", sourceType: "news", hasMedia: true, publishedDate: "2026-06-09T00:00:00Z" },
    { key: "s1", text: "social 1", sourceType: "socialMedia", publishedDate: "2026-06-09T00:00:00Z" },
  ];

  assert.deepEqual(
    selectDailyPromptCandidates(candidates, {
      DAILY_NEWS_ITEM_CAP: "1",
      DAILY_PAPER_ITEM_CAP: "2",
      DAILY_PROJECT_ITEM_CAP: "1",
      DAILY_SOCIAL_ITEM_CAP: "1",
    }, 5).map((candidate) => candidate.text),
    ["news 1", "paper 1", "paper 2", "social 1"]
  );
});
