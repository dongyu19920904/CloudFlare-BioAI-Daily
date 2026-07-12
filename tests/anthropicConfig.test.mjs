import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnthropicHeaders,
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

test("Anthropic headers use x-api-key without a Bearer Authorization header", () => {
  const headers = buildAnthropicHeaders("unit-test-placeholder");
  assert.equal(headers["x-api-key"], "unit-test-placeholder");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal("Authorization" in headers, false);
});
