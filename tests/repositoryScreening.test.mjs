import test from "node:test";
import assert from "node:assert/strict";
import { screenRepository } from "../src/repositoryScreening.js";

test("screens a public GitHub repository without claiming its code or data work", async () => {
  const result = await screenRepository({ source_urls: ["https://github.com/example/tool"] }, async (url) => {
    assert.equal(url, "https://api.github.com/repos/example/tool");
    return new Response(JSON.stringify({ full_name: "example/tool", html_url: "https://github.com/example/tool", default_branch: "main", archived: false, disabled: false, private: false, pushed_at: "2026-09-25T00:00:00Z", license: { spdx_id: "MIT" } }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(result.license_spdx, "MIT");
  assert.equal(result.run_verified, false);
  assert.equal(result.data_verified, false);
  assert.equal(result.commercial_use_verified, false);
});

test("rejects non-GitHub and private-network URLs without making requests", async () => {
  let calls = 0;
  const result = await screenRepository({ source_urls: ["http://127.0.0.1/x", "https://github.com.evil.test/o/r"] }, async () => { calls += 1; throw new Error("Unexpected fetch"); });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("an unrecognized license stays unknown", async () => {
  const result = await screenRepository({ source_urls: ["https://github.com/example/tool"] }, async () => new Response(JSON.stringify({ full_name: "example/tool", private: false, license: { spdx_id: "NOASSERTION" } }), { status: 200, headers: { "content-type": "application/json" } }));
  assert.equal(result.license_spdx, null);
});
