import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeBioDailyMedia,
  validateBioDailyMarkdown,
} from '../src/bioDailyPublication.js';

const candidates = Array.from({ length: 5 }, (_, index) => ({
  title: `Biological age study ${index + 1}`,
  url: `https://arxiv.org/abs/2608.0314${index}`,
  source: 'arXiv',
  mediaUrl: index === 0 ? 'https://example.org/figure.jpg' : '',
}));

function card(index) {
  const candidate = candidates[index - 1];
  return `### ${index}. 生物年龄研究信号 ${index}\n\n**直接结论**：这是一项需要继续验证的研究信号。\n\n**发生了什么**：研究分析了素材中报告的数据和模型表现。\n\n**意味着什么**：研究者可以据此设计下一步外部验证。\n\n**不能得出什么结论**：目前不能证明该方法改善人体健康或产生临床疗效。\n\n**研究类型**：预印本研究。\n\n**对象与样本**：素材未报告完整样本信息。\n\n**发表状态**：预印本，尚未完成同行评议。\n\n**利益关系**：素材未报告。\n\n**证据等级**：初步 — 预印本且尚无独立复现。\n\n**距离实际应用**：仍需外部验证，不能用于个人医疗决策。\n\n**来源**：[arXiv 原文](${candidate.url})`;
}

const validMarkdown = `## 今日结论\n\n今日证据仍以初步研究为主。\n\n## 三分钟速读\n\n- 信号一仍需验证。\n- 信号二没有疗效结论。\n- 下一步关注外部复现。\n\n## 今日信号\n\n${[1, 2, 3, 4, 5].map(card).join('\n\n')}`;

test('validates the 5-8 item evidence contract and allowed source links', () => {
  const result = validateBioDailyMarkdown(validMarkdown, candidates);
  assert.equal(result.passed, true, result.errors.join('\n'));
  assert.equal(result.itemCount, 5);
});

test('blocks clinical exaggeration, title links, unknown sources and Aivora promotion', () => {
  const invalid = validMarkdown
    .replace('### 1. 生物年龄研究信号 1', '### 1. [生物年龄研究信号](https://example.com)')
    .replace('目前不能证明该方法改善人体健康或产生临床疗效。', '研究已经证明可以治愈衰老。')
    .replace('https://arxiv.org/abs/2608.03140', 'https://example.com/hallucinated')
    + '\n\nhttps://www.aivora.cn/';
  const result = validateBioDailyMarkdown(invalid, candidates);
  assert.equal(result.passed, false);
  assert.ok(result.errors.some((error) => /标题必须是纯文本/.test(error)));
  assert.ok(result.errors.some((error) => /未在候选素材/.test(error)));
  assert.ok(result.errors.some((error) => /夸大/.test(error)), result.errors.join('\n'));
  assert.ok(result.errors.some((error) => /爱窝啦/.test(error)));
});

test('drops unapproved media and deterministically adds useful alt and source caption', () => {
  const markdown = '![图片](https://example.org/figure.jpg)\n\n![装饰](https://bad.example/image.jpg)';
  const sanitized = sanitizeBioDailyMedia(markdown, candidates);
  assert.match(sanitized, /!\[Biological age study 1\]\(https:\/\/example\.org\/figure\.jpg "来源：arXiv"\)/);
  assert.doesNotMatch(sanitized, /bad\.example/);
});
