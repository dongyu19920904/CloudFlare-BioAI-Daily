import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyReadingBrief, assessDailySynthesis } from '../src/blogDailyReading.js';
import { selectBlogWritingMaterial } from '../src/blogTopic.js';
import { buildUserPrompt, handleScheduledBlog } from '../src/handlers/scheduledBlog.js';
import { getBlogPrompt } from '../src/prompt/blogPrompt.js';
import { buildBlogSourceContext } from '../src/blogSources.js';
import { stripDailyBlogExtras, validateBlogDraft } from '../src/blogQuality.js';

const story = (title, url) => `### ${title}\n\n${'AI 工具提供一项具体用途，使用时需要按条件选择。'.repeat(4)}\n[说明](${url})`;
const urls = ['https://example.org/local', 'https://example.org/meeting', 'https://example.org/photo'];
const daily = `## **焦点**\n\n${story('1. 本地模型', urls[0])}\n\n${story('2. 会议助手', urls[1])}\n\n## **趣闻**\n\n${story('最后的图片工具', urls[2])}`;

test('actual preview wording cannot invent an earlier personal belief', () => {
    const base = { title: '几项研究回答了不同的问题', dailyContent: daily, blogType: 'bioai-daily' };
    assert.ok(validateBlogDraft({ ...base, body: '这件事我一直觉得可以单纯用意志力解释，直到看到这项研究。' }).severe.includes('unsupported_author_tool_routine'));
    assert.ok(validateBlogDraft({ ...base, body: '以前我默认那是外部条件造成的，现在知道了原因。' }).severe.includes('unsupported_author_tool_routine'));
    assert.ok(!validateBlogDraft({ ...base, body: '我更在意这些结果能回答什么问题。' }).severe.includes('unsupported_author_tool_routine'));
    assert.ok(!validateBlogDraft({ ...base, body: '花钱之前，我认为应该先核对研究对象。' }).severe.includes('unsupported_author_tool_routine'));
});

test('actual preview unsupported causes, hardware additions and human titles are severe, not style scoring', () => {
    const base = { title: '几件工具的适用条件需要分开看', dailyContent: '小鼠衰老和 AI 研究，显存要求 29GB。'.repeat(12), blogType: 'ai-daily' };
    assert.ok(validateBlogDraft({ ...base, body: '因为 Anthropic 没有自己的语音识别模型，所以只支持一种平台。' }).severe.includes('unsupported_platform_cause'));
    assert.ok(!validateBlogDraft({ ...base, body: 'Anthropic 没有自己的语音识别模型。', sourceReceipts: [{ status: 'read', url: 'https://claude.com/resources/articles/example', text: 'Anthropic does not have its own speech recognition model.' }] }).severe.includes('unsupported_platform_cause'));
    for (const body of ['雷雳5是苹果的高速数据接口。', '单台 Mac 的内存大约是 192GB。']) assert.ok(validateBlogDraft({ ...base, body }).severe.includes('unsupported_hardware_fact'));
    assert.ok(!validateBlogDraft({ ...base, body: '来源写的是 29 GB 显存要求，需要继续核对完整运行条件。' }).severe.includes('unsupported_hardware_fact'));
    assert.ok(!validateBlogDraft({ ...base, body: '假设手头有一台 192GB 内存的机器，也不能仅凭内存就判断效果。' }).severe.includes('unsupported_hardware_fact'));
    assert.ok(!validateBlogDraft({ ...base, body: '不能从平台范围推断 Anthropic 没有自己的语音识别模型。' }).severe.includes('unsupported_platform_cause'));
    assert.ok(validateBlogDraft({ ...base, body: '调用 API 意味着数据出境。' }).severe.includes('unsupported_cloud_privacy_claim'));
    assert.ok(!validateBlogDraft({ ...base, body: '调用 API 并不意味着数据出境，需要看实际的部署条件。' }).severe.includes('unsupported_cloud_privacy_claim'));
    assert.ok(validateBlogDraft({ ...base, body: '这个模型没有第三方复测。' }).severe.includes('unsupported_absence_claim'));
    assert.ok(!validateBlogDraft({ ...base, body: '这份摘要没有第三方复测的信息。' }).severe.includes('unsupported_absence_claim'));
    assert.ok(!validateBlogDraft({ ...base, body: '厂商自测不意味着没有独立复测。' }).severe.includes('unsupported_absence_claim'));
    assert.ok(!validateBlogDraft({ ...base, body: '不能说雷雳5是苹果的专属接口。' }).severe.includes('unsupported_hardware_fact'));
    assert.ok(validateBlogDraft({ ...base, blogType: 'bioai-daily', title: '年纪越大越不想动，原来不只是懒', body: '小鼠研究提供了一项线索。' }).severe.includes('unsupported_animal_to_human_title'));
    assert.ok(validateBlogDraft({ ...base, blogType: 'bioai-daily', body: '现在没有临床标准规定这个指标应该怎么处理。' }).severe.includes('unsupported_bio_generalization'));
    assert.ok(!validateBlogDraft({ ...base, blogType: 'bioai-daily', body: '不能断言现在没有临床标准。' }).severe.includes('unsupported_bio_generalization'));
});

test('complete report and final column reach both actual writing prompts', () => {
    const material = selectBlogWritingMaterial(daily);
    assert.equal(material, daily);
    const reading = buildDailyReadingBrief(material, [{ sources: [urls[0]] }]);
    assert.equal(reading.items.length, 3);
    assert.equal(reading.items[0].recentlyCovered, true);
    assert.equal(reading.items[2].sections[0], '趣闻');
    assert.equal(reading.completeInputCharacters, daily.length);
    for (const blogType of ['ai-daily', 'bioai-daily']) {
        const prompt = buildUserPrompt({ dateStr: '2026-11-14', dailyContent: material, blogType, signals: [], reading });
        assert.ok(prompt.includes(JSON.stringify({ dailyContent: daily })));
        for (const url of urls) assert.ok(prompt.includes(url));
        assert.match(prompt, /3–5 件独立材料/);
        assert.doesNotMatch(getBlogPrompt(blogType), /选一项研究|选一个工具或办法|正文约 600–850/);
        assert.match(getBlogPrompt(blogType), /两个现象一起出现不自动证明因果/);
        assert.match(getBlogPrompt(blogType), /不从脑区名、分子全名或实验设计讲起/);
    }
    assert.throws(() => selectBlogWritingMaterial('a'.repeat(80001)), /no silent truncation/);
});

test('duplicate URLs, code headings and images cannot inflate independent story count', () => {
    const input = `${daily}\n\n## 社媒\n${story('又一次本地模型', urls[0] + '?utm_source=rss#part')}\n\n### 图片而已\n\n${'说明。'.repeat(30)}\n![配图](https://example.org/only.jpg)\n\n\`\`\`md\n${story('伪标题', 'https://example.org/code')}\n\`\`\``;
    const reading = buildDailyReadingBrief(input);
    assert.equal(reading.items.length, 3);
    assert.deepEqual(reading.items[0].sections, ['焦点', '社媒']);
    assert.equal(reading.minimumStories, 3);
});

test('reference dumping and code examples do not satisfy prose coverage', () => {
    const reading = buildDailyReadingBrief(daily);
    const references = '\n\n## 参考资料\n' + urls.map(url => `- [说明](${url})`).join('\n');
    const one = `[本地模型](${urls[0]}) 只能说明其中一件事。`;
    assert.deepEqual(assessDailySynthesis(one + references, reading).severe, ['insufficient_daily_synthesis']);
    assert.equal(assessDailySynthesis(urls.map(url => `[实际讨论](${url}) 这条材料提供的事实需要结合自己的任务理解，使用条件也要一同考虑，不能仅凭品牌相同就认为几件工具完全一样。`).join('\n\n') + references, reading).usedItems.length, 3);
    assert.equal(assessDailySynthesis('这是一大段只谈其中一件事的内容。'.repeat(10) + `\n\n另见 [来源](${urls[0]}) [来源](${urls[1]}) [来源](${urls[2]})` + references, reading).usedItems.length, 0);
    assert.equal(assessDailySynthesis('```md\n' + urls.map(url => `[说明](${url})`).join('\n') + '\n```' + references, reading).usedItems.length, 0);
    assert.equal(assessDailySynthesis('短材料', buildDailyReadingBrief(story('唯一材料', urls[0]))).severe.length, 0);
    assert.equal(buildDailyReadingBrief(story('一件', urls[0]) + '\n' + story('两件', urls[1])).minimumStories, 2);
    const bundle = urls.map(url => `[说明](${url})`).join(' ');
    const long = '只有一件新闻的解释，不等于讨论了其他消息。'.repeat(8);
    for (const hidden of [` \`\`\`md\n${long}${bundle}\n \`\`\``, `    ${long}${bundle}`, `\`${long}${bundle}\``, `${long} ${bundle}`]) {
        assert.ok(assessDailySynthesis(hidden + references, reading).usedItems.length < 3, hidden);
    }
});

test('tracking links never cause an entire real news paragraph to disappear', () => {
    const real = '这是 AI 本地模型的完整事实与适用条件。'.repeat(5) + '\n[真实来源](https://example.org/model?utm_campaign=resources&entry=rss)';
    const cleaned = stripDailyBlogExtras(`## 新闻\n${real}\n> 官网自助下单，卡密秒发。\n## 相关问题\n生成问答不作为新闻。`);
    assert.ok(cleaned.includes(real));
    assert.doesNotMatch(cleaned, /生成问答|卡密秒发/);
});

test('repeated A B A citations retain the real offset of every link', () => {
    const detail = '这里认真解释这条消息的具体功能和条件，让读者知道它适用于什么任务，使用时应该注意哪些不同的地方。';
    const together = `${detail}[材料甲](${urls[0]}) ${detail}[材料乙](${urls[1]}) ${detail}[再次比较甲](${urls[0]}) ${detail}`;
    const third = `[材料丙](${urls[2]}) ${detail}`;
    const result = assessDailySynthesis(together + '\n\n' + third, buildDailyReadingBrief(daily));
    assert.equal(result.usedItems.length, 3);
    assert.deepEqual(result.severe, []);
});

test('same original-source budget is spread across different stories', async () => {
    const calls = [];
    const input = 'https://github.com/a/one https://github.com/a/two https://github.com/b/three';
    await buildBlogSourceContext(input, {}, async url => { calls.push(url); return new Response('Public project source. '.repeat(20)); }, [], [
        { sources: ['https://github.com/a/one', 'https://github.com/a/two'] },
        { sources: ['https://github.com/b/three'] },
    ]);
    assert.deepEqual(calls, ['https://api.github.com/repos/a/one/readme', 'https://api.github.com/repos/b/three/readme']);
});

test('cache recovery receipts share the same total two-original-request budget', async () => {
    const known = [{ url: 'https://github.com/a/one', status: 'read', text: '已有读取。' }, { url: 'https://github.com/b/two', status: 'unavailable' }];
    const result = await buildBlogSourceContext('https://github.com/a/one https://github.com/c/three', {}, () => assert.fail('third source request'), known);
    assert.equal(result.receipts[1].reason, 'source_request_budget_exhausted');
});

test('all normalized arXiv references are allowed even after the two-read budget', async t => {
    const papers = ['2611.10001', '2611.10002', '2611.10003'];
    const input = papers.map((id, i) => story(`AI 衰老论文 ${i}`, `https://papers.cool/arxiv/${id}`)).join('\n\n').replaceAll('AI 工具', '这项衰老研究');
    t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
        if (String(url).includes('raw.githubusercontent.com')) return new Response(input);
        if (String(url).includes('arxiv.org')) return new Response('', { status: 503 });
        assert.equal(String(url), 'https://model.invalid/v1/messages');
        const paragraph = '这些研究给出的信息需要放回原来的实验条件。观察到的关系不能直接解释个人的健康状态，研究方法和样本也仍有各自的限制。';
        const output = '几项衰老研究回答了不同的问题\n\n' + paragraph.repeat(7) + '\n\n' + papers.map(id => `[论文](https://arxiv.org/abs/${id}) ${paragraph}`).join('\n\n') + '\n\n## 参考资料\n' + papers.map(id => `- [论文](https://arxiv.org/abs/${id})`).join('\n');
        return new Response(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: output } })}\n\ndata: {"type":"message_stop"}\n\n`);
    });
    const env = { USE_MODEL_PLATFORM: 'ANTHROPIC', ANTHROPIC_API_BASE_URL: 'https://model.invalid', ANTHROPIC_API_KEY: 'placeholder', DEFAULT_ANTHROPIC_MODEL: 'fixture', GITHUB_REPO_OWNER: 'owner' };
    const result = await handleScheduledBlog({}, env, {}, '2026-11-14', { dryRun: true, previewType: 'bioai-daily' });
    assert.equal(result.results[0].status, 'preview');
    assert.equal(result.results[0].coverage.usedItems.length, 3);
});

for (const repairPasses of [false, true]) {
    test(`whole-daily real chain ${repairPasses ? 'repairs missing coverage once' : 'rejects persistent single-story writing after one repair'}`, async t => {
        let calls = 0;
        t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
            if (String(url).includes('raw.githubusercontent.com')) return new Response(daily);
            assert.equal(String(url), 'https://model.invalid/v1/messages');
            const payload = JSON.parse(options.body);
            assert.ok(payload.messages[0].content.includes(urls[2]));
            calls++;
            const used = calls === 2 && repairPasses ? urls : urls.slice(0, 1);
            const paragraph = '一件工具能帮我们做什么，要连同使用条件一起看。几条消息提到的事情各有不同，可以依照自己的任务选择。这些材料还不能说明每个人都适合使用同一个工具。';
            const output = '几种工具放在一起应该怎样选\n\n' + paragraph.repeat(7) + '\n\n' + used.map(url => `[这条材料](${url}) ${paragraph}`).join('\n\n') + '\n\n## 参考资料\n' + urls.map(url => `- [来源](${url})`).join('\n');
            return new Response(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: output } })}\n\ndata: {"type":"message_stop"}\n\n`);
        });
        const env = { USE_MODEL_PLATFORM: 'ANTHROPIC', ANTHROPIC_API_BASE_URL: 'https://model.invalid', ANTHROPIC_API_KEY: 'placeholder', DEFAULT_ANTHROPIC_MODEL: 'fixture', GITHUB_REPO_OWNER: 'owner', DATA_KV: { put() { assert.fail('preview must not write'); } } };
        const result = await handleScheduledBlog({}, env, {}, '2026-11-14', { dryRun: true, previewType: 'ai-daily' });
        assert.equal(calls, 2);
        assert.equal(result.results[0].status, repairPasses ? 'preview' : 'skipped');
        assert.equal(result.results[0].reading.items.length, 3);
        if (!repairPasses) assert.match(result.results[0].reason, /insufficient_daily_synthesis/);
    });
}
