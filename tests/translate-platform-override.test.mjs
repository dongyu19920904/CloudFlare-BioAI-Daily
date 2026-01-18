import assert from "node:assert/strict";
import { callTranslateAPI } from "../src/chatapi.js";

const originalFetch = global.fetch;
const calls = [];

global.fetch = async (url, options) => {
  calls.push(String(url));
  if (String(url).includes("/claude")) {
    return new Response(JSON.stringify({ content: [{ type: "text", text: "anthropic-ok" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (String(url).includes("/gemini")) {
    return new Response(JSON.stringify({ error: { message: "gemini-should-not-run" } }), {
      status: 500,
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

const text = await callTranslateAPI(env, "hello");
assert.equal(text, "anthropic-ok");
assert.ok(calls.some((u) => u.includes("/claude")));
assert.ok(!calls.some((u) => u.includes("/gemini")));

global.fetch = originalFetch;

console.log("translate platform override tests passed");
