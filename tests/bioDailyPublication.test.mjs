import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBioDailyRepairSystemPrompt,
  sanitizeBioDailyMedia,
  validateBioDailyMarkdown,
} from '../src/bioDailyPublication.js';

const candidates = Array.from({ length: 5 }, (_, index) => ({
  title: `Biological age study ${index + 1}`,
  url: `https://arxiv.org/abs/2608.0314${index}`,
  sourceType: 'paper',
  pool: 'research',
  source: 'arXiv',
  mediaUrl: index === 0 ? 'https://example.org/figure.jpg' : '',
}));

function card(index) {
  const candidate = candidates[index - 1];
  const image = index === 1 ? '\n\n![生物年龄研究的模型示意图](https://example.org/figure.jpg "来源：arXiv")' : '';
  return `### ${index}. 生物年龄研究信号 ${index}\n\n**一句话结论**：这是一项需要继续验证的研究信号。\n\n**发生了什么**：研究分析了素材中报告的数据和模型表现。${image}\n\n**为什么重要**：研究者可以据此设计下一步外部验证。\n\n**证据说明**：**初步证据**。研究类型：预印本研究；对象/样本：素材未报告完整样本信息；发表状态：尚未完成同行评议；利益关系：素材未报告；距离应用：仍需外部验证。\n\n**目前不能得出**：目前不能证明该方法改善人体健康或产生临床疗效。\n\n**来源**：[arXiv 原文](${candidate.url})`;
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

test('accepts separate object and sample-size labels as equivalent evidence detail', () => {
  const equivalent = validMarkdown.replaceAll(
    '对象/样本：素材未报告完整样本信息',
    '对象：人体数据；样本量：素材未报告完整样本信息',
  );
  const result = validateBioDailyMarkdown(equivalent, candidates);
  assert.equal(result.passed, true, result.errors.join('\n'));
});

test('blocks the optional follow-up module until prediction entities are source-verifiable', () => {
  const result = validateBioDailyMarkdown(`${validMarkdown}\n\n## 继续观察\n\n建议去候选之外的数据集复现。`, candidates);
  assert.equal(result.passed, false);
  assert.ok(result.errors.some((error) => /继续观察/.test(error)), result.errors.join('\n'));
});

test('does not accept a discovery article as the sole source for biomedical research', () => {
  const discoveryUrl = 'https://news.example/aging-clock-report';
  const discoveryCandidates = [
    { ...candidates[0], url: discoveryUrl, description: '', primaryUrl: '' },
    ...candidates.slice(1),
  ];
  const invalid = validMarkdown.replace(candidates[0].url, discoveryUrl);
  const result = validateBioDailyMarkdown(invalid, discoveryCandidates);
  assert.equal(result.passed, false);
  assert.ok(result.errors.some((error) => /必须链接论文、注册平台或机构原文/.test(error)), result.errors.join('\n'));
});

test('requires animal boundaries when the linked primary paper contains aged mice', () => {
  const animalCandidates = [
    {
      ...candidates[0],
      contentText: 'In vivo, inhibition reduced inflammation and improved healthspan in aged mice.',
      details: {
        content_html: 'In vivo, inhibition reduced inflammation and improved healthspan in aged mice.',
        publicationStatus: 'journal record',
        journal: 'Nature',
        publicationTypes: ['Journal Article'],
      },
    },
    ...candidates.slice(1),
  ];
  const result = validateBioDailyMarkdown(validMarkdown, animalCandidates);
  assert.equal(result.passed, false);
  assert.ok(result.errors.some((error) => /包含动物研究/.test(error)), result.errors.join('\n'));

  const repairPrompt = buildBioDailyRepairSystemPrompt(result.errors, animalCandidates);
  assert.match(repairPrompt, /期刊：Nature/);
  assert.match(repairPrompt, /aged mice/);
});
