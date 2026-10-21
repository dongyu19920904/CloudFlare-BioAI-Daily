import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleBioDailyMarkdown, prepareBioDailyPlainEditingInput, parseBioDailyPlainEditingResult, buildBioDailyCandidateBudget, readBioDailyPreviewCache, restoreBioDailySourceMedia, isBioDailyPaperCandidate, deduplicateBioDailyNews } from '../src/bioDailyMarkdown.js';
import { getSystemPromptSummarizationStepOne } from '../src/prompt/summarizationPromptStepZero.js';

test('daily assembly preserves source, evidence and media but removes the generated preamble', () => {
    const body = '## **🔥 今日焦点 TOP 1**\n### 1. 一项研究\n**观察到关联。** [队列数据](https://example.org/study)不证明因果。\n来源类型 / 证据阶段 / 可信度：中\n![研究配图](https://example.org/image.png)';
    const output = assembleBioDailyMarkdown('## 快速导航\n旧前言\n\n' + body, '事实。\n变化。\n先核查研究。');
    assert.ok(output.endsWith(body));
    assert.equal((output.match(/## \*\*今日摘要\*\*/g) || []).length, 1);
    assert.doesNotMatch(output, /快速导航|旧前言|今日ai资讯|utm_campaign/);
});

test('plain editing extracts the complete short edition and preserves the source set', () => {
    const original = '## **🔥 今日焦点 TOP 1**\n\n### 1. 原稿\n[媒体报道](https://example.org/study)研究较复杂。';
    const body = '## **🔥 今日焦点 TOP 1**\n\n### 1. 小鼠研究有新发现\n据[报道](https://example.org/study)，小鼠中观察到变化，还不能推到人体。';
    const edited = parseBioDailyPlainEditingResult('## **今日摘要**\n\n```\n事实。\n变化。\n限制。\n```\n\n' + body, original);
    assert.equal(edited.body, body);
    assert.equal(edited.summary, '事实。\n变化。\n限制。');
    assert.deepEqual(parseBioDailyPlainEditingResult('```markdown\n## **今日摘要**\n\n```text\n事实。\n变化。\n限制。\n```\n\n' + body + '\n```', original), edited);
    assert.throws(() => parseBioDailyPlainEditingResult('只有三句话。', original), /complete body/);
    assert.throws(() => parseBioDailyPlainEditingResult('## **今日摘要**\n```\n甲\n乙\n丙\n```\n' + body.replace('example.org', 'invented.org'), original), /source URL/);
    assert.throws(() => parseBioDailyPlainEditingResult('## **今日摘要**\n```\n甲\n乙\n丙\n```\n## **🔥 今日焦点 TOP 1**\n### 1. 无来源\n没有链接。', original), /source URL/);
});

test('only TOP news has ranking numbers, not following product or project headings', () => {
    const input='## **🔥 今日焦点 TOP 1**\n\n### 1. 研究\n[报道](https://example.org/a)结果。\n\n## **⌘ 开源 TOP 项目**\n\n### 11. 工具\n[仓库](https://github.com/example/tool)用途。';
    const result=deduplicateBioDailyNews(input);
    assert.match(result,/### 1\. 研究/);
    assert.match(result,/### 工具/);
    assert.doesNotMatch(result,/### 11\./);
});

test('source evidence preserves full matching sources with the same protected links', () => {
    const original='## 今日焦点 TOP 1\n\n### 1. 工具\n\n[项目](https://github.com/test/age)';
    const input=prepareBioDailyPlainEditingInput(original,[
        'Project Name: age\nUrl: https://github.com/test/age\nDescription: estimates age',
        'Project Name: unrelated\nUrl: https://github.com/test/other',
        'Url: https://github.com/test/age\nFull evidence: '+'x'.repeat(1200),
    ]);
    assert.match(input.prompt,/原始来源事实核查材料/);
    assert.match(input.prompt,/Full evidence: x{1200}/);
    assert.match(input.prompt,/Description: estimates age/);
    assert.match(input.prompt,/Url: BIOAI_REF_1/);
    assert.doesNotMatch(input.prompt,/unrelated|https:\/\//);
    assert.equal(Object.keys(input.references).length,1);
});

test('generic cognitive-bias AI debate is not a biomedical paper candidate', () => {
    assert.equal(isBioDailyPaperCandidate({title:'AI debate and cognitive bias',text:'LLM debate helps human judges correct biases and cognition in general tasks.'}),false);
    assert.equal(isBioDailyPaperCandidate({title:'AI brain MRI for cognitive aging',text:'A neural network estimates brain age from human MRI.'}),true);
});

test('plain editing protects long source and image URLs with reusable short references', () => {
    const original='## **🔥 今日焦点 TOP 1**\n\n### 1. 研究\n据[报道](https://example.org/long-path?oc=5&x=123)，结果待核实。\n\n[![原图](https://example.org/a.jpg "原图")](https://example.org/long-path?oc=5&x=123)';
    const input=prepareBioDailyPlainEditingInput(original);
    assert.doesNotMatch(input.prompt,/https?:/);
    assert.equal(Object.keys(input.references).length,2);
    const response='## **今日摘要**\n```\n甲\n乙\n丙\n```\n'+input.prompt;
    const edited=parseBioDailyPlainEditingResult(response,original,input.references);
    assert.equal(edited.body,original);
    assert.throws(()=>parseBioDailyPlainEditingResult(response.replace('BIOAI_REF_1','BIOAI_REF_999'),original,input.references),/invented a source reference/);
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

test('same source is not repeated across news columns, while sourced FAQ stays', () => {
    const input = '## **🔥 今日焦点 TOP 2**\n\n### 1. 甲\n[甲](https://example.org/a)\n\n### 2. 乙\n[乙](https://example.org/b)\n\n## **⚡ 产品与功能更新**\n\n### 重复甲\n[甲](https://example.org/a?utm_source=test)\n\n## **❓ 相关问题**\n\n### 甲能否应用？\n[甲](https://example.org/a)仍需核查。';
    const output = deduplicateBioDailyNews(input);
    assert.doesNotMatch(output, /产品与功能更新|重复甲/);
    assert.match(output, /甲能否应用/);
    assert.match(output, /TOP 2/);
    assert.equal(deduplicateBioDailyNews(output), output);
});

test('duplicate TOP sources are removed and remaining ranks/count stay truthful', () => {
    const output = deduplicateBioDailyNews('## **🔥 今日焦点 TOP 2**\n\n### 1. 甲\n[甲](https://example.org/a)\n\n### 2. 又甲\n[甲](https://example.org/a)');
    assert.match(output, /TOP 1/);
    assert.doesNotMatch(output, /### 2\./);
});

test('TOP reading removes explicit cross-reference placeholders and repairs duplicate numbering', () => {
    const input = '## **🔥 今日焦点 TOP 10**\n\n### 1. 甲\n[甲](https://example.org/a)有新结果。\n\n### 2. 项目预留\n*见下方开源 TOP 项目*\n\n### 2. 乙\n[乙](https://example.org/b)尚未临床验证。\n\n### 3. 已报道\n（已在TOP 1详述，此处不重复。）\n\n## **⌘ 开源 TOP 项目**\n\n### 项目\n[仓库](https://github.com/example/project)可试用。';
    const output = deduplicateBioDailyNews(input);
    assert.match(output, /TOP 2/);
    assert.doesNotMatch(output, /见下方|此处不重复|项目预留/);
    assert.match(output, /### 2\. 乙/);
    assert.match(output, /尚未临床验证/);
    assert.match(output, /github.com\/example\/project/);
    assert.equal(deduplicateBioDailyNews(output), output);
});

test('daily FAQ does not expand secondary news into legal or regulatory advice', () => {
    const input = '## **🔥 今日焦点 TOP 1**\n\n### 1. 保存服务\n[报道](https://example.org/service)无疗效证据。\n\n## **❓ 相关问题**\n\n### 有何监管差异？\n依据第361条及BLA法规解释。';
    const output = deduplicateBioDailyNews(input);
    assert.doesNotMatch(output, /相关问题|BLA/);
    assert.match(output, /无疗效证据/);
});
