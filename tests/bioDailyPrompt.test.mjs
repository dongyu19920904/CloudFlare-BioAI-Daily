import test from 'node:test';
import assert from 'node:assert/strict';

import { getSystemPromptSummarizationStepOne } from '../src/prompt/summarizationPromptStepZero.js';

test('ordinary daily prompt uses the compact reader contract while retaining evidence metadata', () => {
  const prompt = getSystemPromptSummarizationStepOne('2026-08-07');
  for (const field of ['一句话结论', '发生了什么', '为什么重要', '证据说明', '目前不能得出', '来源']) {
    assert.match(prompt, new RegExp(field));
  }
  for (const evidenceDetail of ['研究类型', '对象/样本', '发表状态', '利益关系', '距离应用']) {
    assert.match(prompt, new RegExp(evidenceDetail.replace('/', '\\/')));
  }
  assert.match(prompt, /Primary source/);
  assert.match(prompt, /2–4 张/);
  assert.doesNotMatch(prompt, /每条都有 11 个固定字段/);
  assert.match(prompt, /不生成.*爱窝啦链接/);
});
