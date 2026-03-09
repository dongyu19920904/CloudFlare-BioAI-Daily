import test from 'node:test';
import assert from 'node:assert/strict';
import { countTopItems, normalizeDailyStructure, validateDailyContentModules } from '../src/dailyValidation.js';

test('normalizeDailyStructure canonicalizes loose BioAI section headings', () => {
    const input = [
        '# 今日 AI 生命科学资讯',
        '## 🔥 重磅 Top 10（或更少）',
        '- [条目一](https://example.com/1)',
        '- [条目二](https://example.com/2)',
        '## 值得关注',
        '## AI 生命科学 趋势预测',
        '## 相关问题'
    ].join('\n');

    const output = normalizeDailyStructure(input, { kind: 'bio' });
    assert.match(output, /^## \*\*今日AI生命科学资讯\*\*/m);
    assert.match(output, /^## \*\*🔥 重磅 TOP 10\*\*/m);
    assert.match(output, /^## \*\*📌 值得关注\*\*/m);
    assert.match(output, /^## \*\*🔮 AI趋势预测\*\*/m);
    assert.match(output, /^## \*\*❓ 相关问题\*\*/m);
});

test('countTopItems accepts bullet items for BioAI top section', () => {
    const input = [
        '## **?? ??? TOP 10**',
        '- [?????](https://example.com/1)',
        '- [?????(https://example.com/2)',
        '- [?????(https://example.com/3)'
    ].join('\n');

    assert.equal(countTopItems(input), 3);
});

test('countTopItems accepts numbered heading items for BioAI top section', () => {
    const input = [
        '## **?? ??? TOP 10**',
        '## 1. [?????](https://example.com/1)',
        '## 2. [?????(https://example.com/2)',
        '## 3. [?????(https://example.com/3)'
    ].join('\n');

    assert.equal(countTopItems(input), 3);
});

test('validateDailyContentModules accepts normalized BioAI headings and bullet top items', () => {
    const input = [
        '# 今日 AI 生命科学资讯',
        '## 🔥 重磅 Top 10',
        '- [条目一](https://example.com/1)',
        '- [条目二](https://example.com/2)',
        '- [条目三](https://example.com/3)',
        '- [条目四](https://example.com/4)',
        '- [条目五](https://example.com/5)',
        '- [条目六](https://example.com/6)',
        '- [条目七](https://example.com/7)',
        '## 值得关注',
        '- [补充一](https://example.com/8)',
        '## AI 生命科学 趋势预测',
        '### 趋势一',
        '## 相关问题',
        '### 问题一'
    ].join('\n');

    assert.doesNotThrow(() => validateDailyContentModules(input, { DAILY_TOP_MIN_ITEMS: '7' }, { kind: 'bio' }));
});
