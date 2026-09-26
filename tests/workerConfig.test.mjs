import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  WORKER_CONFIG_DEFAULTS,
  withWorkerConfigDefaults,
} from "../src/workerConfig.js";

test("fixed BioAI settings keep their deployed values in code", () => {
  assert.equal(WORKER_CONFIG_DEFAULTS.OPEN_TRANSLATE, "false");
  assert.equal(WORKER_CONFIG_DEFAULTS.PROJECT_MIN_STARS, "1");
  assert.equal(WORKER_CONFIG_DEFAULTS.PROJECT_ACTIVE_DAYS, "240");
  assert.equal(WORKER_CONFIG_DEFAULTS.PROJECT_MAX_QUERIES_PER_RUN, "6");
  assert.equal(WORKER_CONFIG_DEFAULTS.LONGEVITY_MIN_SELECTED_ITEMS, "10");
  assert.equal(WORKER_CONFIG_DEFAULTS.OPENAI_FALLBACK_ENABLED, "false");
});

test("explicit bindings override defaults and resource bindings keep identity", () => {
  const kv = { get() {}, put() {} };
  const rateLimiter = { limit() {} };
  const original = {
    DATA_KV: kv,
    PROJECT_LAB_RATE_LIMITER: rateLimiter,
    PROJECT_MIN_STARS: "9",
    OPEN_TRANSLATE: "true",
  };
  const resolved = withWorkerConfigDefaults(original);

  assert.equal(resolved.DATA_KV, kv);
  assert.equal(resolved.PROJECT_LAB_RATE_LIMITER, rateLimiter);
  assert.equal(resolved.PROJECT_MIN_STARS, "9");
  assert.equal(resolved.OPEN_TRANSLATE, "true");
  assert.equal(original.ANTHROPIC_RETRY_MAX, undefined);
});

test("wrangler config stays below the free Worker binding limit", () => {
  const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const varsBlock = config.match(/\[vars\]([\s\S]*?)\n\[/)?.[1] || "";
  const variableCount = [...varsBlock.matchAll(/^\s*[A-Z][A-Z0-9_]*\s*=/gm)].length;

  // Leave room for KV, rate limiting, and the existing Worker secrets.
  assert.ok(variableCount <= 45, `too many wrangler vars: ${variableCount}`);
});

test("free Worker keeps its three existing cron slots and uses GitHub guard for the fourth job", () => {
  const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const crons = config.match(/\[triggers\]([\s\S]*?)\]/)?.[1].match(/"[0-9* ]+"/g) || [];
  assert.equal(crons.length, 3);
  assert.match(config, /PROJECT_OPPORTUNITY_SHARED_WITH_OPPORTUNITY_CRON = "false"/);
  assert.match(config, /PROJECT_OPPORTUNITY_CRON_SCHEDULE = "45 11 \* \* \*"/);
});
