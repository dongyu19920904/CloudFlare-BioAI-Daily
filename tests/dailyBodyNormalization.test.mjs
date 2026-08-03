import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDailyBody, replaceIncorrectDomainLinks } from '../src/helpers.js';

test('normalizeDailyBody trims draft text before the evidence-aware daily section', () => {
    const input = `这是一段不应发布的草稿\n\n## 今日重要信号\n\n### 1. [研究](https://doi.org/10.1000/test)`;
    assert.equal(normalizeDailyBody(input), '## 今日重要信号\n\n### 1. [研究](https://doi.org/10.1000/test)');
});

test('normalizeDailyBody keeps a clean evidence-aware body unchanged', () => {
    const input = '## 今日重要信号\n\n### 1. [研究](https://doi.org/10.1000/test)';
    assert.equal(normalizeDailyBody(input), input);
});

test('normalizeDailyBody removes model commentary after the final source field', () => {
    const input = `## 今日重要信号

### 1. [研究](https://doi.org/10.1000/test)
- **来源**：[论文](https://doi.org/10.1000/test)

---

**编者说明**

其余候选不予收录。`;
    assert.equal(normalizeDailyBody(input), `## 今日重要信号

### 1. [研究](https://doi.org/10.1000/test)
- **来源**：[论文](https://doi.org/10.1000/test)`);
});

test('legacy site links are normalized to the real BioAI domain without touching primary sources', () => {
    const input = '[旧入口](https://ai.hubtoday.app/archive) [论文](https://doi.org/10.1000/test)';
    assert.equal(
        replaceIncorrectDomainLinks(input),
        '[旧入口](https://news.aibioo.cn/archive) [论文](https://doi.org/10.1000/test)'
    );
});
