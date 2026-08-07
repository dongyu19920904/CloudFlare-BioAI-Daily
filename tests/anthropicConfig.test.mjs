import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnthropicHeaders,
  callChatAPI,
  normalizeAnthropicMessagesUrl,
  resolveAnthropicConfig,
} from "../src/chatapi.js";

test("Anthropic Messages URLs are normalized exactly once", () => {
  const cases = [
    ["https://example.com", "https://example.com/v1/messages"],
    ["https://example.com/", "https://example.com/v1/messages"],
    [
      "https://example.com/v1/messages",
      "https://example.com/v1/messages",
    ],
    [
      "https://example.com/v1/messages/",
      "https://example.com/v1/messages",
    ],
    ["https://example.com/v1", "https://example.com/v1/messages"],
    [
      "https://example.com/custom/path",
      "https://example.com/custom/path/v1/messages",
    ],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeAnthropicMessagesUrl(input), expected);
  }
});

test("new Anthropic endpoint variables take precedence with legacy fallbacks", () => {
  const current = resolveAnthropicConfig({
    ANTHROPIC_API_BASE_URL: "https://primary.example/new/",
    ANTHROPIC_API_URL: "https://primary.example/legacy",
    ANTHROPIC_BACKUP_API_BASE_URL: "https://backup.example/custom/v1/messages",
    ANTHROPIC_BASE_URL: "https://backup.example/legacy",
    DEFAULT_ANTHROPIC_MODEL: "primary-model",
    DEFAULT_ANTHROPIC_BACKUP_MODEL: "backup-model",
  });
  assert.equal(
    current.primary.messagesUrl,
    "https://primary.example/new/v1/messages"
  );
  assert.equal(
    current.backup.messagesUrl,
    "https://backup.example/custom/v1/messages"
  );
  assert.equal(current.primary.modelName, "primary-model");
  assert.equal(current.backup.modelName, "backup-model");

  const legacy = resolveAnthropicConfig({
    ANTHROPIC_API_URL: "https://primary.example/legacy",
    ANTHROPIC_BASE_URL: "https://backup.example/legacy",
    DEFAULT_ANTHROPIC_MODEL: "primary-model",
    FALLBACK_ANTHROPIC_MODEL: "legacy-backup-model",
  });
  assert.equal(
    legacy.primary.messagesUrl,
    "https://primary.example/legacy/v1/messages"
  );
  assert.equal(
    legacy.backup.messagesUrl,
    "https://backup.example/legacy/v1/messages"
  );
  assert.equal(legacy.backup.modelName, "legacy-backup-model");
});

test("Anthropic proxy headers preserve x-api-key and Bearer compatibility", () => {
  const headers = buildAnthropicHeaders("unit-test-placeholder");
  assert.equal(headers["x-api-key"], "unit-test-placeholder");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(headers.Authorization, "Bearer unit-test-placeholder");
});

test("a primary Anthropic network failure reaches the configured backup route", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes("primary.example")) {
      throw new TypeError("fetch failed");
    }
    return new Response(JSON.stringify({
      content: [{ type: "text", text: "backup ok" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await callChatAPI({
      USE_MODEL_PLATFORM: "ANTHROPIC",
      ANTHROPIC_API_BASE_URL: "https://primary.example",
      ANTHROPIC_BACKUP_API_BASE_URL: "https://backup.example",
      ANTHROPIC_API_KEY: "primary-placeholder",
      ANTHROPIC_BACKUP_API_KEY: "backup-placeholder",
      DEFAULT_ANTHROPIC_MODEL: "primary-model",
      DEFAULT_ANTHROPIC_BACKUP_MODEL: "backup-model",
      ANTHROPIC_RETRY_MAX: "0",
      ANTHROPIC_REQUEST_TIMEOUT_MS: "1000",
      ANTHROPIC_MAX_TOKENS: "256",
    }, "hello");

    assert.equal(result, "backup ok");
    assert.equal(calls.length, 2);
    assert.match(calls[0], /primary\.example/);
    assert.match(calls[1], /backup\.example/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
