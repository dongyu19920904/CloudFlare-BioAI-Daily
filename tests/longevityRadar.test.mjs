import test from "node:test";
import assert from "node:assert/strict";

import LongevityRadarDataSource from "../src/dataSources/longevity-radar.js";

const originalFetch = globalThis.fetch;

test("longevity radar reads capped bio-radar-v1 signals and preserves evidence metadata", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      schema_version: "bio-radar-v1",
      items: [
        {
          id: "paper-1",
          title: "AI aging clock validation",
          title_zh: "AI 衰老时钟验证",
          url: "https://example.com/paper-1",
          source: "Europe PMC",
          source_type: "paper",
          published_at: "2026-09-20T01:00:00Z",
          signal_score: 0.84,
          relevance_tier: "core",
          selection_reason: "AI 与生命延续双重相关",
          primary_topic: "aging_clock",
          study_subject: "human",
          publication_stage: "preprint",
          risk_flags: ["preprint_not_peer_reviewed"],
        },
        {
          id: "bad-url",
          title: "Unsafe item",
          url: "javascript:alert(1)",
        },
      ],
    }),
  });

  try {
    const raw = await LongevityRadarDataSource.fetch({ LONGEVITY_RADAR_MAX_ITEMS: "1" });
    const items = LongevityRadarDataSource.transform(raw);

    assert.equal(items.length, 1);
    assert.equal(items[0].type, "paper");
    assert.equal(items[0].title, "AI 衰老时钟验证");
    assert.equal(items[0].details.publicationStage, "preprint");
    assert.deepEqual(items[0].details.riskFlags, ["preprint_not_peer_reviewed"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("longevity radar fails open when the endpoint is unavailable", async () => {
  globalThis.fetch = async () => { throw new Error("network down"); };

  try {
    const raw = await LongevityRadarDataSource.fetch({});
    assert.deepEqual(raw, { items: [] });
    assert.deepEqual(LongevityRadarDataSource.transform(raw), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("longevity radar can be disabled without making a request", async () => {
  let requested = false;
  globalThis.fetch = async () => {
    requested = true;
    return { ok: true, json: async () => ({ schema_version: "bio-radar-v1", items: [] }) };
  };

  try {
    const raw = await LongevityRadarDataSource.fetch({ LONGEVITY_RADAR_ENABLED: "false" });
    assert.deepEqual(raw, { items: [] });
    assert.equal(requested, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
