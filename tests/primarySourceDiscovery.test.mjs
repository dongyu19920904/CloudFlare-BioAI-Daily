import test from "node:test";
import assert from "node:assert/strict";
import { discoverPrimarySourceCandidates } from "../src/primarySourceDiscovery.js";

test("discovers a DOI through an allow-listed article and validates metadata without upgrading the claim", async () => {
  const requested = [];
  const fetcher = async (url) => {
    requested.push(url);
    if (url.includes("api.crossref.org")) {
      return new Response(JSON.stringify({ message: { DOI: "10.1002/alz.71772", title: ["MIND diet and cognition"], type: "journal-article" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("<html>Publication details: DOI: 10.1002/alz.71772</html>", { status: 200, headers: { "content-type": "text/html" } });
  };
  const result = await discoverPrimarySourceCandidates({ source_urls: ["https://medicalxpress.com/news/example.html"] }, fetcher);
  assert.equal(result.length, 1);
  assert.equal(result[0].doi, "10.1002/alz.71772");
  assert.equal(result[0].relationship_verified, false);
  assert.equal(requested.length, 2);
});

test("does not fetch arbitrary URLs supplied by model-generated text", async () => {
  let calls = 0;
  const result = await discoverPrimarySourceCandidates({ source_urls: ["http://127.0.0.1/private", "https://example.com/foo"] }, async () => { calls += 1; throw new Error("should not fetch"); });
  assert.deepEqual(result, []);
  assert.equal(calls, 0);
});

test("does not accept a DOI when registry metadata does not match", async () => {
  const result = await discoverPrimarySourceCandidates({ source_urls: ["https://medicalxpress.com/news/example.html"] }, async (url) => {
    if (url.includes("api.crossref.org")) return new Response(JSON.stringify({ message: { DOI: "10.1002/other", title: ["Other paper"] } }), { status: 200 });
    return new Response("DOI: 10.1002/alz.71772", { status: 200, headers: { "content-type": "text/html" } });
  });
  assert.deepEqual(result, []);
});
