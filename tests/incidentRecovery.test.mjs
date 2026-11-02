import test from 'node:test';
import assert from 'node:assert/strict';
import * as daily from '../src/bioDailyMarkdown.js';

const top = '## **🔥 今日焦点 TOP 1**\n\n### 1. 研究\n\n[来源](https://example.org/study)仅为小鼠研究。';
const project = '## **⌘ 开源 TOP 项目**\n\n### 工具\n\n[仓库](https://github.com/example/tool)尚未实测。';
const research = '## **🧪 前沿研究**\n\n### 另一研究\n\n[原文](https://example.org/paper)尚待验证。';

test('daily assembly repairs reversed optional columns without changing stories, URLs or figures', () => {
  const result = daily.assembleBioDailyMarkdown([top, project, research].join('\n\n---\n\n'), '事实。\n进展。\n仍需验证。');
  assert.ok(result.indexOf('前沿研究') < result.indexOf('开源 TOP 项目'));
  for (const block of [top, project, research]) assert.ok(result.includes(block));
});

test('daily ordering is stable, keeps missing columns absent and leaves unknown or duplicate sections for validation', () => {
  const input = `${top}\n\n${research}\n\n${project}`;
  assert.equal(daily.normalizeBioDailySectionOrder(input), input);
  assert.equal(daily.normalizeBioDailySectionOrder(top), top);
  for (const unknown of [`${input}\n\n## 未知栏目\n内容。`, `${input}\n\n${project}`]) {
    assert.equal(daily.normalizeBioDailySectionOrder(unknown), unknown);
  }
});

test('source references restore only input URLs, keep canonical DOI identity and reject invented IDs', async () => {
  const { createOpportunitySourceReferences } = await import('../src/opportunitySourceReferences.js');
  const refs = createOpportunitySourceReferences('Source: https://github.com/agnikitha/retfound-cvd-screening\nDOI: https://doi.org/10.1000/AbC');
  assert.match(refs.protect('Source: https://doi.org/10.1000/ABC'), /BIOAI_SOURCE_2/);
  assert.equal(refs.restore('[代码](BIOAI_SOURCE_1)'), '[代码](<https://github.com/agnikitha/retfound-cvd-screening>)');
  assert.throws(() => refs.restore('[代码](BIOAI_SOURCE_99)'), /Unknown/);
});

test('late scheduled self-heal heals its intended Shanghai edition, not the next early-morning date', async () => {
  const { resolveSelfHealDate } = await import('../scripts/self-heal-date.mjs');
  for (const now of ['2026-11-01T13:45:00Z', '2026-11-01T18:34:57Z', '2026-11-02T02:00:00Z']) {
    assert.equal(resolveSelfHealDate({ now, eventName: 'schedule' }), '2026-11-01');
  }
  assert.equal(resolveSelfHealDate({ now: '2026-11-02T13:45:00Z', eventName: 'schedule' }), '2026-11-02');
});

test('self-heal manual overrides keep Shanghai today, validate real dates and handle month/year rollover', async () => {
  const { resolveSelfHealDate } = await import('../scripts/self-heal-date.mjs');
  assert.equal(resolveSelfHealDate({ now: '2026-11-01T18:34:57Z', eventName: 'workflow_dispatch' }), '2026-11-02');
  assert.equal(resolveSelfHealDate({ now: '2026-11-01T18:34:57Z', eventName: 'schedule', targetDate: '2026-10-31' }), '2026-10-31');
  assert.equal(resolveSelfHealDate({ now: '2026-01-01T01:00:00Z', eventName: 'schedule' }), '2025-12-31');
  assert.throws(() => resolveSelfHealDate({ targetDate: '2026-02-30' }), /Invalid/);
});
