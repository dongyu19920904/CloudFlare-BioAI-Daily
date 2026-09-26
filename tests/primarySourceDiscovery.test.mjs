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

test("discovers a DOI from a Lifespan article but keeps medical claims unverified", async () => {
  const requested = [];
  const result = await discoverPrimarySourceCandidates({ source_urls: ["https://lifespan.io/creatine-protects-lean-mass-even-without-exercise/"] }, async (url) => {
    requested.push(url);
    if (url.includes("api.crossref.org")) {
      return new Response(JSON.stringify({ message: { DOI: "10.1080/15502783.2026.2716273", title: ["Effects of creatine supplementation with and without exercise and diet intervention"], type: "journal-article" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify([{ link: "https://lifespan.io/creatine-protects-lean-mass-even-without-exercise/", content: { rendered: '<a href="https://doi.org/10.1080/15502783.2026.2716273">Original paper</a>' } }]), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(result[0]?.doi, "10.1080/15502783.2026.2716273");
  assert.equal(result[0]?.relationship_verified, false);
  assert.match(requested[0], /^https:\/\/lifespan\.io\/wp-json\/wp\/v2\/posts\?/);
  assert.equal(requested.length, 2);
});

test("rejects a WordPress response for a different article", async () => {
  let requests = 0;
  const result = await discoverPrimarySourceCandidates({ source_urls: ["https://lifespan.io/creatine-protects-lean-mass-even-without-exercise/"] }, async () => {
    requests += 1;
    return new Response(JSON.stringify([{ link: "https://lifespan.io/other/", content: { rendered: "10.1080/15502783.2026.2716273" } }]), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.deepEqual(result, []);
  assert.equal(requests, 1);
});

test("does not accept a DOI when registry metadata does not match", async () => {
  const result = await discoverPrimarySourceCandidates({ source_urls: ["https://medicalxpress.com/news/example.html"] }, async (url) => {
    if (url.includes("api.crossref.org")) return new Response(JSON.stringify({ message: { DOI: "10.1002/other", title: ["Other paper"] } }), { status: 200 });
    return new Response("DOI: 10.1002/alz.71772", { status: 200, headers: { "content-type": "text/html" } });
  });
  assert.deepEqual(result, []);
});
