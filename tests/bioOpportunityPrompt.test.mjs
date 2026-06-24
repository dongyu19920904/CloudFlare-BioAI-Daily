import test from "node:test";
import assert from "node:assert/strict";

import { getSystemPromptBioOpportunity } from "../src/prompt/bioOpportunityPrompt.js";
import { getSystemPromptBioProjectOpportunity } from "../src/prompt/bioProjectOpportunityPrompt.js";

test("bio opportunity prompt applies the business-material decision kernel", () => {
  const prompt = getSystemPromptBioOpportunity("2026-06-24");

  assert.match(prompt, /商机资料提炼出的判断内核/);
  assert.match(prompt, /先选鱼塘，再选工具/);
  assert.match(prompt, /目标鱼塘/);
  assert.match(prompt, /痛点和付费理由/);
  assert.match(prompt, /可交付物/);
  assert.match(prompt, /最低成本验证/);
  assert.match(prompt, /复购或升级路径/);
  assert.match(prompt, /合规边界/);
  assert.match(prompt, /不能写“能治、能逆转、能保证效果”/);
});

test("bio project opportunity prompt focuses projects on runnable assets", () => {
  const prompt = getSystemPromptBioProjectOpportunity("2026-06-24");

  assert.match(prompt, /商机资料提炼出的项目筛选内核/);
  assert.match(prompt, /先选鱼塘，再选项目/);
  assert.match(prompt, /试跑门槛/);
  assert.match(prompt, /可交付物/);
  assert.match(prompt, /最低成本验证/);
  assert.match(prompt, /二次开发路径/);
  assert.match(prompt, /不要只看 stars/);
  assert.match(prompt, /今天怎么试跑、怎么写内容、怎么沉淀成资料或工具/);
});
