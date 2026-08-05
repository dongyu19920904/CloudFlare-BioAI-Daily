import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDailyPromptItemCap,
  resolveDailyMinimumItemCount,
  resolveDailyPoolCaps,
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

test("daily publication requires at least five qualified signals", () => {
  assert.equal(resolveDailyMinimumItemCount({}), 5);
  assert.equal(resolveDailyMinimumItemCount({ DAILY_MIN_PUBLISH_ITEMS: "6" }), 6);
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

test("resolveDailySourceCaps defaults prevent one source type from consuming the issue", () => {
  assert.deepEqual(resolveDailySourceCaps({}), {
    news: 4,
    paper: 3,
    project: 1,
    socialMedia: 1,
  });
});

test("resolveDailyPoolCaps reserves distinct editorial pools", () => {
  assert.deepEqual(resolveDailyPoolCaps({}), {
    research: 3,
    tool: 2,
    industry: 2,
    project: 1,
    fun: 1,
  });
});

test("selectDailyPromptCandidates keeps source variety", () => {
  const candidates = [
    { key: "p1", title: "AI biological age paper 1", text: "aging cohort", sourceType: "paper", url: "https://arxiv.org/abs/2606.00001", publishedDate: "2026-06-09T03:00:00Z" },
    { key: "p2", title: "AI biological age paper 2", text: "aging cohort", sourceType: "paper", url: "https://arxiv.org/abs/2606.00002", publishedDate: "2026-06-09T02:00:00Z" },
    { key: "p3", title: "AI biological age paper 3", text: "aging cohort", sourceType: "paper", url: "https://arxiv.org/abs/2606.00003", publishedDate: "2026-06-09T01:00:00Z" },
    { key: "n1", title: "FDA aging biomarker policy", text: "FDA policy for biological age", sourceType: "news", url: "https://fda.gov/example", hasMedia: true, publishedDate: "2026-06-09T00:00:00Z" },
    { key: "s1", title: "Longevity lab discussion", text: "longevity research discussion", sourceType: "socialMedia", url: "https://example.com/social", publishedDate: "2026-06-09T00:00:00Z" },
  ];

  assert.deepEqual(
    selectDailyPromptCandidates(candidates, {
      DAILY_NEWS_ITEM_CAP: "1",
      DAILY_PAPER_ITEM_CAP: "2",
      DAILY_PROJECT_ITEM_CAP: "1",
      DAILY_SOCIAL_ITEM_CAP: "1",
    }, 5).map((candidate) => candidate.text),
    ["aging cohort", "FDA policy for biological age", "longevity research discussion", "aging cohort"]
  );
});

test("accepted publication memory removes the same canonical event", () => {
  const candidate = {
    title: "AI biological age cohort",
    text: "AI biological age cohort",
    sourceType: "paper",
    url: "https://papers.cool/arxiv/2606.00001",
    publishedDate: "2026-06-09T03:00:00Z",
  };
  const selected = selectDailyPromptCandidates([candidate], {}, 8, {
    acceptedKeys: new Set(["arxiv:2606.00001"]),
  });
  assert.deepEqual(selected, []);
});

test("news boilerplate cannot make an unrelated event BioAI-relevant", () => {
  const selected = selectDailyPromptCandidates([{
    title: "Immune pathway prevents fungal infection",
    description: "Researchers describe a host defense mechanism.",
    text: "Site navigation: healthy aging, biological age, longevity model.",
    sourceType: "news",
    url: "https://example.com/fungal-infection",
    publishedDate: "2026-08-05T12:00:00Z",
  }], {}, 8);
  assert.deepEqual(selected, []);
});

test("generic clinical and omics stories need an explicit aging-domain connection", () => {
  const selected = selectDailyPromptCandidates([{
    title: "Phase 3 fatty liver treatment enrollment",
    description: "A clinical trial uses proteomic biomarkers and machine learning.",
    sourceType: "news",
    url: "https://example.com/fatty-liver-trial",
    publishedDate: "2026-08-05T12:00:00Z",
  }], {}, 8);
  assert.deepEqual(selected, []);
});

test("imaging, managing and forensic age estimation do not masquerade as aging science", () => {
  const candidates = [
    {
      title: "Medical imaging model for infection management",
      description: "A benchmark for managing radiology workflows.",
      sourceType: "paper",
      url: "https://arxiv.org/abs/2608.00001",
    },
    {
      title: "Forensic age estimation from dental images",
      description: "A deep learning benchmark across two populations.",
      sourceType: "paper",
      url: "https://doi.org/10.1000/forensic-age",
    },
  ];
  assert.deepEqual(selectDailyPromptCandidates(candidates, {}, 8), []);
});

test("an Alzheimer benchmark mentioned only inside an unrelated AI abstract is not a daily signal", () => {
  const selected = selectDailyPromptCandidates([{
    title: "Graph-of-Thoughts causal discovery fairness audits",
    description: "The method is evaluated on Asia, Alzheimer's and respiratory benchmark datasets.",
    sourceType: "paper",
    url: "https://arxiv.org/abs/2608.02877",
  }], {}, 8);
  assert.deepEqual(selected, []);
});

test("one publisher cannot dominate the daily candidate set", () => {
  const candidates = [1, 2, 3].map((index) => ({
    title: `Biological age signal ${index}`,
    description: "Aging clock research update.",
    sourceType: "news",
    url: `https://same-source.example/story-${index}`,
    publishedDate: `2026-08-0${index}T12:00:00Z`,
  }));
  const selected = selectDailyPromptCandidates(candidates, { DAILY_PUBLISHER_ITEM_CAP: "2" }, 8);
  assert.equal(selected.length, 2);
});

test("DOI resolver traffic is grouped by registrant prefix, not as one publisher", () => {
  const candidates = [
    { title: "Lifespan cohort marker", sourceType: "paper", url: "https://doi.org/10.1007/example.1" },
    { title: "Alzheimer mouse study", sourceType: "paper", url: "https://doi.org/10.64898/example.2" },
  ];
  const selected = selectDailyPromptCandidates(candidates, { DAILY_PUBLISHER_ITEM_CAP: "1" }, 8);
  assert.equal(selected.length, 2);
});
