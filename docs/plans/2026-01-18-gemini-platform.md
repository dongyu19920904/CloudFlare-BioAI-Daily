# Gemini Platform Switch (BioAI Backend) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch BioAI backend generation to Gemini proxy with Claude Sonnet 4.5 fallback, leaving translation workflows on Claude.

**Architecture:** Update `wrangler.toml` to set Gemini as the main platform and ensure Gemini stream/version config matches the proxy. Adjust Gemini fallback logic to attempt Anthropic on any Gemini failure, then OpenAI only for Anthropic rate limits.

**Tech Stack:** Cloudflare Workers (wrangler), Node (ESM), JS tests.

---

### Task 1: Add Gemini fallback tests (TDD)

**Files:**
- Create: `tests/gemini-fallback.test.mjs`

**Step 1: Write failing test**

```js
import assert from "node:assert/strict";
import { callChatAPI, callChatAPIStream } from "../src/chatapi.js";

const originalFetch = global.fetch;
const calls = [];

global.fetch = async (url, options) => {
  calls.push(String(url));
  if (String(url).includes("/gemini")) {
    return new Response(JSON.stringify({ error: { message: "boom" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (String(url).includes("/claude")) {
    return new Response(JSON.stringify({ content: [{ text: "anthropic-ok" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  throw new Error(`Unexpected URL: ${url}`);
};

const env = {
  USE_MODEL_PLATFORM: "GEMINI",
  GEMINI_API_URL: "https://code.newcli.com/gemini",
  GEMINI_API_KEY: "test-key",
  DEFAULT_GEMINI_MODEL: "gemini-3-pro",
  GEMINI_STREAM_MODE: "off",
  ANTHROPIC_API_URL: "https://code.newcli.com/claude/aws",
  ANTHROPIC_API_KEY: "test-key",
  DEFAULT_ANTHROPIC_MODEL: "claude-sonnet-4-5"
};

const text = await callChatAPI(env, "hello", null);
assert.equal(text, "anthropic-ok");

let streamed = "";
for await (const chunk of callChatAPIStream(env, "hello", null)) {
  streamed += chunk;
}
assert.equal(streamed, "anthropic-ok");

assert.ok(calls.some((u) => u.includes("/gemini")));
assert.ok(calls.some((u) => u.includes("/claude")));

global.fetch = originalFetch;

console.log("gemini fallback tests passed");
```

**Step 2: Run test to verify it fails**

Run: `node tests/gemini-fallback.test.mjs`
Expected: FAIL (Gemini error bubbles; no fallback yet).

### Task 2: Implement Gemini failure fallback to Anthropic

**Files:**
- Modify: `src/chatapi.js`

**Step 1: Update non-stream Gemini fallback**

Replace the Gemini branch in `callChatAPI` so Anthropic fallback happens on any Gemini error (not only rate limit):

```js
    } else { // Default to Gemini
        try {
            return await callGeminiChatAPI(env, promptText, systemPromptText);
        } catch (error) {
            if (canUseAnthropicFallback(env)) {
                console.warn("Gemini error encountered; falling back to Anthropic.");
                try {
                    return await callAnthropicChatAPI(env, promptText, systemPromptText);
                } catch (anthroError) {
                    if (isRateLimitError(anthroError) && canUseOpenAIFallback(env)) {
                        console.warn("Anthropic rate limit encountered; falling back to OpenAI.");
                        return await callOpenAIChatAPI(env, promptText, systemPromptText);
                    }
                    throw anthroError;
                }
            }
            if (isRateLimitError(error) && canUseOpenAIFallback(env)) {
                console.warn("Gemini rate limit encountered; falling back to OpenAI.");
                return await callOpenAIChatAPI(env, promptText, systemPromptText);
            }
            throw error;
        }
    }
```

**Step 2: Update streaming Gemini fallback**

In `callChatAPIStream`, update both `streamMode === "off"` and streaming blocks to mirror the above: fall back to Anthropic on any Gemini error, then OpenAI only if Anthropic is rate-limited.

**Step 3: Run test to verify it passes**

Run: `node tests/gemini-fallback.test.mjs`
Expected: PASS.

### Task 3: Switch AI platform to Gemini in Worker config

**Files:**
- Modify: `wrangler.toml`

**Step 1: Update variables**

Set:
```
USE_MODEL_PLATFORM = "GEMINI"
GEMINI_STREAM_MODE = "auto"
GEMINI_API_VERSION = "auto"
```

### Task 4: Deploy + smoke tests

**Step 1: Deploy**

Run: `wrangler deploy`
Expected: deploy success.

**Step 2: Trigger daily generation**

Run:
`Invoke-WebRequest -Uri "https://<worker-subdomain>.workers.dev/testTriggerScheduled?date=2026-01-18&key=test-secret-key-change-me" -Method GET`
Expected: 200 with `success: true`.

**Step 3: Trigger blog generation**

Run:
`Invoke-WebRequest -Uri "https://<worker-subdomain>.workers.dev/testTriggerBlog?date=2026-01-18&key=test-secret-key-change-me" -Method GET`
Expected: 200 with `success: true`.

### Task 5: Commit & push

```
git add src/chatapi.js wrangler.toml tests/gemini-fallback.test.mjs docs/plans/2026-01-18-gemini-platform.md
git commit -m "feat: switch to gemini with anthropic fallback"
git push
```

### Task 6: Force translations to Anthropic (keep Gemini for generation)

**Files:**
- Create: `tests/translate-platform-override.test.mjs`
- Modify: `src/chatapi.js`
- Modify: `src/dataSources/github-trending.js`
- Modify: `src/dataSources/huggingface-papers.js`

**Step 1: Add a failing test**

Verify `callTranslateAPI` always uses Anthropic even when `USE_MODEL_PLATFORM=GEMINI`.

**Step 2: Implement translation helper**

Add `callTranslateAPI` to `src/chatapi.js` to force `USE_MODEL_PLATFORM="ANTHROPIC"` and call `callChatAPI`.

**Step 3: Use translation helper**

Switch translation call sites in data sources to use `callTranslateAPI`.

**Step 4: Run tests**

Run:
```
node tests/gemini-fallback.test.mjs
node tests/translate-platform-override.test.mjs
```
