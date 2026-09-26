import test from "node:test";
import assert from "node:assert/strict";
import { assessOpportunitySourceGate, generateWithSourceGate } from "../src/opportunitySourceGate.js";

const options = { date: "2026-09-26", section: "opportunity" };
const missing = "## 今日主推\n### 肌酸选题\n- **证据来源**：某篇研究的报道（研究编号未提供）\n";
const sourced = "## 今日主推\n### 肌酸选题\n- **证据来源**：[原报道](https://example.org/research/creatine)\n";

test("a real report without a clickable source cannot publish", () => {
  const gate = assessOpportunitySourceGate(missing, options);
  assert.equal(gate.publishable, false);
  assert.deepEqual(gate.missing, ["肌酸选题"]);
});

test("a bounded second attempt can supply only real source URLs", async () => {
  let calls = 0;
  const result = await generateWithSourceGate(async (prompt) => {
    calls += 1;
    if (calls === 2) assert.match(prompt, /不要猜测、补造 DOI/);
    return calls === 1 ? missing : sourced;
  }, "素材 URL: https://example.org/research/creatine", options);
  assert.equal(calls, 2);
  assert.equal(result, sourced);
});

test("two failed attempts stop before any sidecar or page write", async () => {
  let calls = 0;
  await assert.rejects(generateWithSourceGate(async () => { calls += 1; return missing; }, "素材", options), /Source-link gate blocked/);
  assert.equal(calls, 2);
});

test("an honest no-project day is publishable without inventing a repository", () => {
  const gate = assessOpportunitySourceGate("## 今日优先项目\n**今日无符合筛选标准的项目**", { ...options, section: "project-opportunity" });
  assert.equal(gate.publishable, true);
});

test("model-invented source links are rejected even when well formed", () => {
  const gate = assessOpportunitySourceGate(sourced, { ...options, allowedSourceUrls: "素材 URL: https://example.org/other" });
  assert.equal(gate.publishable, false);
});
