import test from "node:test";
import assert from "node:assert/strict";

import { buildOpportunityRecordsDocument, buildOpportunityRecordsPath, commitOpportunityRecords, extractOpportunityRecords } from "../src/opportunityRecords.js";

const sample = `## 先看信号
- 信息

## 今日主推
### MIND饮食资料包与抗衰饮食对比表
- **证据来源**:报道 [原文](https://medicalxpress.com/news/2026-09-mind-diet-aging-brains.html)。
- **目标鱼塘**:健康内容创作者
- **痛点和付费理由**:读者需要结构化信息
- **可交付物**:资料包
- **成功指标**:7天阅读量>500
- **复购或升级路径**:19.9元资料包

### 神经免疫交互论文导读资料库
- **证据来源**:[报道](https://www.news-medical.net/news/20260925/example.aspx)
- **目标鱼塘**:研究学习者
- **可交付物**:资料库

## 可测试小机会
- 不属于主推
`;

test("extracts only today's two promoted opportunities with stable distinct IDs", () => {
  const options = { date: "2026-09-26", section: "opportunity" };
  const first = extractOpportunityRecords(sample, options);
  const second = extractOpportunityRecords(sample, options);
  assert.equal(first.length, 2);
  assert.deepEqual(first, second);
  assert.notEqual(first[0].opportunity_id, first[1].opportunity_id);
  assert.equal(first[0].state, "needs_primary_source");
  assert.equal(first[0].source_verified, false);
  assert.equal(first[0].demand_verified, false);
  assert.equal(first[0].hypotheses.success_metric, "7天阅读量>500");
  assert.ok(first[0].risk_flags.includes("commercial_hypothesis"));
  assert.equal(first[1].suggested_route, "structured_resource");
});

test("does not promote missing-source material to verified", () => {
  const records = extractOpportunityRecords("## 今日主推\n### 无来源\n- **可交付物**:工具", { date: "2026-09-26" });
  assert.equal(records[0].state, "missing_source");
  assert.equal(records[0].source_verified, false);
});

test("correcting a source URL preserves the opportunity ID", () => {
  const initial = extractOpportunityRecords(sample, { date: "2026-09-26" });
  const corrected = extractOpportunityRecords(sample.replace("https://medicalxpress.com/news/2026-09-mind-diet-aging-brains.html", "https://doi.org/10.1002/alz.71772"), { date: "2026-09-26" });
  assert.equal(initial[0].opportunity_id, corrected[0].opportunity_id);
  assert.notDeepEqual(initial[0].source_urls, corrected[0].source_urls);
});

test("document references the public report without claiming publication", () => {
  const document = buildOpportunityRecordsDocument(sample, { date: "2026-09-26", section: "opportunity" });
  assert.equal(document.source_page, "/opportunity/2026-09/2026-09-26/");
  assert.equal(document.opportunities.length, 2);
  assert.equal("published" in document, false);
});

test("record sidecars use separate static paths for both report sections", () => {
  assert.equal(buildOpportunityRecordsPath("2026-09-26", "opportunity"), "static/data/opportunities/opportunity/2026-09-26.json");
  assert.equal(buildOpportunityRecordsPath("2026-09-26", "project-opportunity"), "static/data/opportunities/project-opportunity/2026-09-26.json");
  assert.throws(() => buildOpportunityRecordsPath("2026-09-26", "daily"));
});

test("sidecar writer is idempotent and keeps report publication separate", async () => {
  let stored = "";
  const writes = [];
  const github = {
    getSha: async () => stored ? "existing-sha" : null,
    getContent: async () => stored,
    write: async (_env, path, content, message, sha) => {
      writes.push({ path, message, sha });
      stored = content;
    },
  };
  const noDoiFetch = async () => new Response("<html>No DOI</html>", { status: 200, headers: { "content-type": "text/html" } });
  const options = [{}, "2026-09-26", "opportunity", sample, github, noDoiFetch];
  const first = await commitOpportunityRecords(...options);
  const second = await commitOpportunityRecords(...options);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].sha, null);
  assert.equal(JSON.parse(stored).opportunities.length, 2);
});

test("a failed sidecar write rejects the workflow before any page write", async () => {
  const github = {
    getSha: async () => null,
    getContent: async () => "",
    write: async () => { throw new Error("GitHub unavailable"); },
  };
  await assert.rejects(commitOpportunityRecords({}, "2026-09-26", "opportunity", sample, github, async () => new Response("", { status: 404 })), /GitHub unavailable/);
});
