import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleBioDailyMarkdown, buildBioDailyCandidateBudget, readBioDailyPreviewCache, restoreBioDailySourceMedia, isBioDailyPaperCandidate } from '../src/bioDailyMarkdown.js';
import { getSystemPromptSummarizationStepOne } from '../src/prompt/summarizationPromptStepZero.js';

test('daily assembly preserves source, evidence and media but removes the generated preamble', () => {
    const body = '## **🔥 今日焦点 TOP 10**\n### 1. 一项研究\n**观察到关联。** [队列数据](https://example.org/study)不证明因果。\n来源类型 / 证据阶段 / 可信度：中\n![研究配图](https://example.org/image.png)';
    const output = assembleBioDailyMarkdown('## 快速导航\n旧前言\n\n' + body, '事实。\n变化。\n先核查研究。');
    assert.ok(output.endsWith(body));
    assert.equal((output.match(/## \*\*今日摘要\*\*/g) || []).length, 1);
    assert.doesNotMatch(output, /快速导航|旧前言|今日ai资讯|utm_campaign/);
});

test('assembly keeps optional columns and does not manufacture unavailable material', () => {
    const body = '## **🔥 今日焦点 TOP 2**\n### 1. 甲\n甲。\n### 2. 乙\n乙。\n## **❓ 相关问题**\n### 能否外推？\n不能。';
    const output = assembleBioDailyMarkdown(body, '甲。\n乙。\n先核查。');
    assert.ok(output.endsWith(body));
    assert.doesNotMatch(output, /开源 TOP 项目|社媒精选|AI趣闻/);
});

test('candidate reservation uses actual selected sources without increasing collection or calls', () => {
    assert.match(buildBioDailyCandidateBudget([{ sourceType: 'project' }, { sourceType: 'project' }, { sourceType: 'socialMedia' }]), /开源 TOP 预留 2 条，为社媒精选预留 1 条/);
    assert.match(buildBioDailyCandidateBudget([{ sourceType: 'news' }]), /开源 TOP 预留 0 条，为社媒精选预留 0 条/);
});

test('preview reads only the requested dated source cache and never writes KV', async () => {
    const reads = [];
    const kv = {
        get: async (key, type) => {
            reads.push([key, type]);
            return key.endsWith('-news') ? [{ url: 'https://example.org/source' }] : null;
        },
        put: () => assert.fail('preview must not write KV'),
    };
    const result = await readBioDailyPreviewCache(kv, '2026-10-16', ['news', 'paper']);
    assert.deepEqual(reads, [['2026-10-16-news', 'json'], ['2026-10-16-paper', 'json']]);
    assert.equal(result.news.length, 1);
    assert.deepEqual(result.paper, []);
});

test('BioAI uses AI daily section order while retaining scientific and small-project boundaries', () => {
    const prompt = getSystemPromptSummarizationStepOne('2026-10-15');
    const sections = ['🔥 今日焦点 TOP 10', '⚡ 产品与功能更新', '🧪 前沿研究', '◎ 行业变化与个人影响', '⌘ 开源 TOP 项目', '◉ 社媒精选', '😄 AI趣闻', '❓ 相关问题'];
    const indices = sections.map(section => prompt.indexOf('## **' + section + '**'));
    assert.ok(indices.every((index, n) => index >= 0 && (n === 0 || index > indices[n - 1])));
    assert.match(prompt, /动物有效不等于人体有效/);
    assert.match(prompt, /不要求普通 AI Trending 日榜/);
    assert.doesNotMatch(prompt, /预测概率.*XX%|## \*\*📎 今日可引用要点/);
});

test('daily media repair uses only the matching cited source and never repeats images in FAQ', () => {
    const input = '## **🔥 今日焦点 TOP 1**\n\n### 1. 研究\n\n[研究报道](https://example.org/a)发现机制线索。\n\n## **❓ 相关问题**\n\n### 能否应用？\n\n[研究报道](https://example.org/a)仅是早期研究。';
    const candidates = [
        { title: '研究来源', url: 'https://example.org/a', mediaUrl: 'https://example.org/a.jpg' },
        { title: '其他来源', url: 'https://example.org/b', mediaUrl: 'https://example.org/b.jpg' },
    ];
    const output = restoreBioDailySourceMedia(input, candidates);
    assert.equal((output.match(/!\[/g) || []).length, 1);
    assert.match(output, /a\.jpg/);
    assert.doesNotMatch(output, /b\.jpg/);
    assert.doesNotMatch(output.slice(output.indexOf('## **❓')), /!\[/);
    assert.equal(restoreBioDailySourceMedia(output, candidates), output);
});

test('ordinary longevity daily excludes crop-only applications without excluding biomedical methods', () => {
    assert.equal(isBioDailyPaperCandidate({ title: 'Potato leaf disease CNN', text: 'Neural network disease classification on PlantVillage farms.' }), false);
    assert.equal(isBioDailyPaperCandidate({ title: 'Single-cell trajectory inference', text: 'Neural network on single-cell benchmarks.' }), true);
    assert.equal(isBioDailyPaperCandidate({ title: 'Plant-derived drug discovery', text: 'Machine learning for human Alzheimer drug discovery.' }), true);
});
