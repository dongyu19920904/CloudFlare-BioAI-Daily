import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDailyConclusionLines,
  buildEditorialDedupeKeys,
  matchDailyEvidenceItems,
  normalizeEditorialItem,
  validateDailyMarkdown,
} from '../src/bioEditorialPolicy.js';

function paper(overrides = {}) {
  return {
    type: 'paper',
    title: 'Machine learning aging study',
    url: 'https://doi.org/10.1234/example.1',
    description: '',
    published_date: '2026-08-01',
    source: 'Example Journal',
    details: { sourceAuthority: '一手/官方', journalTitle: 'Example Journal', ...overrides },
  };
}

test('animal and preprint evidence is always preliminary', () => {
  const item = normalizeEditorialItem(paper({
    isPreprint: true,
    abstractText: 'A preprint study in mice found a biomarker association.',
  }));
  assert.equal(item.details.editorial.evidenceLevel, '初步');
  assert.match(item.details.editorial.evidenceReason, /不能直接外推到人体|尚不足以支持临床效果判断/);
});

test('human cohort evidence can be medium but not automatically high', () => {
  const item = normalizeEditorialItem(paper({
    abstractText: 'A prospective cohort included 850 participants and evaluated a machine learning brain age model.',
  }));
  assert.equal(item.details.editorial.studyType, '队列研究');
  assert.equal(item.details.editorial.species, '人类');
  assert.equal(item.details.editorial.sampleSize, 'n=850');
  assert.equal(item.details.editorial.evidenceLevel, '中');
});

test('human protein wording is not treated as a human-participant study', () => {
  const item = normalizeEditorialItem(paper({
    abstractText: 'A machine-learning model predicts binding selectivity for a human protein.',
  }));
  assert.equal(item.details.editorial.species, '未报告');
  assert.equal(item.details.editorial.evidenceLevel, '初步');
});

test('sample sizes with thousands separators are preserved correctly', () => {
  const item = normalizeEditorialItem(paper({
    abstractText: 'A cohort study included 134,481 patients and reported an association.',
  }));
  assert.equal(item.details.editorial.sampleSize, 'n=134481');
});

test('four-digit sample sizes without separators are not truncated', () => {
  const item = normalizeEditorialItem(paper({
    abstractText: 'A cross-sectional study included 7054 community-dwelling older adults.',
  }));
  assert.equal(item.details.editorial.sampleSize, 'n=7054');
});

test('a sufficiently sized primary-source randomized trial can be high evidence', () => {
  const item = normalizeEditorialItem(paper({
    abstractText: 'A randomized controlled trial included 300 patients.',
  }));
  assert.equal(item.details.editorial.evidenceLevel, '高');
});

test('DOI and canonical GitHub repositories produce entity-level dedupe keys', () => {
  const first = buildEditorialDedupeKeys(paper());
  const second = buildEditorialDedupeKeys(paper({ content_html: 'DOI: 10.1234/EXAMPLE.1' }));
  assert.ok(first.includes('doi:10.1234/example.1'));
  assert.ok(second.includes('doi:10.1234/example.1'));
  assert.ok(buildEditorialDedupeKeys({ title: 'Tool', url: 'https://github.com/Owner/Repo/issues/5', details: {} }).includes('repo:owner/repo'));
});

function signal(index, extra = '') {
  return `### ${index}. [可信标题 ${index}](https://doi.org/10.1000/test.${index})
- **发生了什么**：研究团队报告了一项有明确设计的研究。
- **这意味着什么**：它提供了一个可以继续验证的研究信号。
- **目前不能得出什么结论**：不能据此判断人体疗效或给出医疗建议。${extra}
- **证据等级**：初步（预印本且尚未完成独立验证）
- **研究类型**：预印本
- **物种/对象**：人类
- **样本量**：n=80
- **距离实际应用**：仍需同行评审、外部验证和监管评估。
- **来源**：[论文原文](https://doi.org/10.1000/test.${index})`;
}

test('daily validator accepts 3-8 fully attributed signals', () => {
  const markdown = `## 今日重要信号\n\n${signal(1)}\n\n${signal(2)}\n\n${signal(3)}`;
  assert.deepEqual(validateDailyMarkdown(markdown), { valid: true, errors: [], signalCount: 3 });
});

test('daily validator blocks marketing links and animal-to-human efficacy claims', () => {
  const markdown = `## 今日重要信号\n\n${signal(1, ' 动物研究证明患者治疗有效。')}\n\n${signal(2)}\n\n${signal(3)}\n\nhttps://aivora.cn`;
  const result = validateDailyMarkdown(markdown);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /爱窝啦/.test(error)));
  assert.ok(result.errors.some((error) => /动物研究/.test(error)));
});

test('daily validator blocks evidence upgrades and sources outside the supplied contract', () => {
  const expected = normalizeEditorialItem(paper({
    isPreprint: true,
    abstractText: 'A preprint with 80 participants.',
  }));
  const upgraded = `## 今日重要信号\n\n${signal(1).replace('https://doi.org/10.1000/test.1', expected.url).replace('初步（', '中（')}\n\n${signal(2)}\n\n${signal(3)}`;
  const result = validateDailyMarkdown(upgraded, [expected]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /不得.*升级/.test(error)));
  assert.ok(result.errors.some((error) => /不在输入素材/.test(error)));
});

test('published evidence overview can use only items present in the final markdown', () => {
  const first = normalizeEditorialItem(paper());
  const second = normalizeEditorialItem({
    ...paper(),
    url: 'https://doi.org/10.1234/example.2',
    details: { ...paper().details, doi: '10.1234/example.2' },
  });
  const markdown = `## 今日重要信号\n\n${signal(1).replace('https://doi.org/10.1000/test.1', first.url)}`;
  assert.deepEqual(matchDailyEvidenceItems(markdown, [first, second]).map((item) => item.url), [first.url]);
});

test('low-information correction notices are excluded from ordinary daily candidates', () => {
  const item = normalizeEditorialItem({
    ...paper(),
    title: 'Author Correction: A prior aging study',
  });
  assert.match(item.details.editorial.dailyExclusionReason, /更正|勘误/);
});

test('daily conclusions are derived from validated signals and evidence counts', () => {
  const overview = '高 0 条 / 中 1 条 / 初步 2 条。';
  const lines = buildDailyConclusionLines(`## 今日重要信号\n\n${signal(1)}`, overview);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /可信标题 1.*初步/);
  assert.match(lines[1], /中 1 条.*初步 2 条/);
  assert.match(lines[2], /医疗.*验证|验证.*医疗/);
});

test('daily validator rejects model commentary about omitted candidates', () => {
  const markdown = `## 今日重要信号\n\n${signal(1)}\n\n${signal(2)}\n\n${signal(3)}\n\n> 关于本期未收录素材的说明：其他项目未入选。`;
  const result = validateDailyMarkdown(markdown);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /未收录/.test(error)));
});
