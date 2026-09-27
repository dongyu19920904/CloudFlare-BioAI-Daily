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
  await assert.rejects(generateWithSourceGate(async () => { calls += 1; return missing; }, "素材", options), /Opportunity publication gate blocked/);
  assert.equal(calls, 2);
});

test("an honest no-project day is publishable without inventing a repository", () => {
  const gate = assessOpportunitySourceGate("## 今日优先项目\n**今日无符合筛选标准的项目**", { ...options, section: "project-opportunity" });
  assert.equal(gate.publishable, true);
});

test("no-project day does not bypass the health self-assessment gate", () => {
  const gate = assessOpportunitySourceGate("## 今日优先项目\n**今日无符合筛选标准的项目**\n## 小机会\n免疫衰老自测清单", { ...options, section: "project-opportunity" });
  assert.equal(gate.publishable, false);
  assert.equal(gate.unsafe_health_self_assessment, true);
});

test("model-invented source links are rejected even when well formed", () => {
  const gate = assessOpportunitySourceGate(sourced, { ...options, allowedSourceUrls: "素材 URL: https://example.org/other" });
  assert.equal(gate.publishable, false);
});

test("animal-study opportunity cannot turn into a consumer self-test even with a source URL", () => {
  const markdown = "## 今日主推\n### 免疫衰老研究追踪\n- **证据来源**：小鼠实验 https://example.org/mouse-study\n- **可交付物**：免疫衰老自测清单\n";
  const gate = assessOpportunitySourceGate(markdown, { ...options, allowedSourceUrls: "素材 URL: https://example.org/mouse-study" });
  assert.deepEqual(gate.missing, []);
  assert.equal(gate.unsafe_health_self_assessment, true);
  assert.equal(gate.publishable, false);
});

test("bounded retry may replace an unsupported self-test with research tracking", async () => {
  let calls = 0;
  const result = await generateWithSourceGate(async (prompt) => {
    calls += 1;
    if (calls === 2) assert.match(prompt, /动物实验当作人体检测方法/);
    return `## 今日主推\n### 免疫衰老研究追踪\n- **证据来源**：小鼠实验 https://example.org/mouse-study\n- **可交付物**：${calls === 1 ? "免疫衰老自测清单" : "研究来源卡与局限整理"}\n`;
  }, "素材 URL: https://example.org/mouse-study", options);
  assert.equal(calls, 2);
  assert.match(result, /研究来源卡/);
});
