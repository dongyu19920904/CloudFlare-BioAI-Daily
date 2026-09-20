import test from "node:test";
import assert from "node:assert/strict";

import { getSystemPromptSummarizationStepOne } from "../src/prompt/summarizationPromptStepZero.js";

test("daily prompt keeps the report evidence-first and separate from opportunity columns", () => {
  const prompt = getSystemPromptSummarizationStepOne("2026-09-20");

  assert.match(prompt, /先讲证据，再讲意义/);
  assert.match(prompt, /发生了什么、证据来自哪里、目前到哪一步/);
  assert.match(prompt, /不展开“谁会付费、怎么卖、怎么做产品”/);
  assert.match(prompt, /signal_score.*不代表临床有效性/s);
  assert.match(prompt, /来源类型 \/ 证据阶段 \/ 可信度/);
  assert.match(prompt, /不输出一级标题/);
  assert.doesNotMatch(prompt, /太离谱了|笑死|跑分直接碾压/);
});
