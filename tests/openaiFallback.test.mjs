import test from "node:test";
import assert from "node:assert/strict";

import {
  getOpenAIBaseUrl,
  buildOpenAIPayload,
  shouldFailoverFromAnthropic,
} from "../src/chatapi.js";

test("getOpenAIBaseUrl accepts official-style /v1 base urls", () => {
  assert.equal(
    getOpenAIBaseUrl({ OPENAI_BASE_URL: "https://code.newcli.com/codex/v1" }),
    "https://code.newcli.com/codex"
  );
});

test("getOpenAIBaseUrl falls back to OPENAI_API_URL", () => {
  assert.equal(
    getOpenAIBaseUrl({ OPENAI_API_URL: "https://code.newcli.com/codex" }),
    "https://code.newcli.com/codex"
  );
});

test("buildOpenAIPayload uses GPT-5 compatible fields", () => {
  const payload = buildOpenAIPayload("gpt-5.4", [
    { role: "developer", content: "You are a strict editor." },
    { role: "user", content: "Reply with OK." },
  ], { stream: true });

  assert.equal(payload.model, "gpt-5.4");
  assert.equal(payload.stream, true);
  assert.equal(payload.max_completion_tokens, 4096);
  assert.equal("max_tokens" in payload, false);
  assert.equal("temperature" in payload, false);
  assert.equal("top_p" in payload, false);
});

test("shouldFailoverFromAnthropic covers blocked-route errors", () => {
  assert.equal(
    shouldFailoverFromAnthropic(new Error("Anthropic Chat API error (403): account suspended")),
    true
  );
  assert.equal(
    shouldFailoverFromAnthropic(new Error("Anthropic Chat API error (401): unauthorized")),
    true
  );
  assert.equal(
    shouldFailoverFromAnthropic(new Error("Anthropic Chat API error (400): invalid request")),
    false
  );
});
