import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getBlogPrompt } from '../src/prompt/blogPrompt.js';
import { getBlogAuthorKnowledge, selectBlogAuthorRecords } from '../src/prompt/blogAuthorKnowledge.js';
import { containsPrivateFinancialDetail, containsUnapprovedFinancialDetail, selectBlogSignals, stripDailyBlogExtras, validateBlogDraft } from '../src/blogQuality.js';
import { handleScheduledBlog } from '../src/handlers/scheduledBlog.js';
import { callChatAPIStream } from '../src/chatapi.js';

test('production blog prompt loads dated public knowledge without old financial state', () => {
    const knowledge = getBlogAuthorKnowledge();
    assert.match(knowledge, /核对至 2026-10-05/);
    assert.match(knowledge, /没有与这次触发材料直接匹配/);
    for (const type of ['ai-daily', 'bioai-daily']) {
        const prompt = getBlogPrompt(type);
        assert.ok(prompt.includes(getBlogAuthorKnowledge(null, type)));
        assert.doesNotMatch(prompt, /现在月入稳定几千|每天销售额大约|每天利润大约|半躺平的生活/);
        assert.equal(containsUnapprovedFinancialDetail(prompt), false);
        assert.match(prompt, /外部事实，不证明 yuyu/);
    }
});

test('public knowledge has no raw diary identifiers, credentials or private endpoints', () => {
    const raw = readFileSync(new URL('../src/prompt/blogAuthorKnowledge.json', import.meta.url), 'utf8');
    assert.doesNotMatch(raw, /sk-[A-Za-z0-9]{20,}|refresh_token|creationDate|lastModified|[A-Z]:\\|threadId|noteId|\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    const knowledge = JSON.parse(raw);
    assert.equal(knowledge.publicFinancialStatements.length, 0);
    assert.equal(containsUnapprovedFinancialDetail(knowledge.publicFinancialStatements.map(item => item.statement).join('\n')), false);
});

test('personal financial amounts are severe but product prices and sample counts are not', () => {
    for (const line of ['我的月收入是2.3万元', '账号店每天销售额9000元', '小店赚了两万元利润', '月入六万', '我店铺的毛利率是30%']) {
        assert.equal(containsPrivateFinancialDetail(line), true, line);
        const result = validateBlogDraft({ title: '账号店和自动化的长期观察', body: line, dailyContent: 'Cursor 与 Claude 变化影响用户理解成本。'.repeat(30), blogType: 'ai-daily' });
        assert.ok(result.severe.includes('unapproved_financial_detail'));
    }
    for (const line of ['业务规模较年初明显增长，但客服仍然忙。', '我看了官方月费20美元的产品。', '研究公开样本共5000个。', '行业报告称某公司收入增长30%。']) {
        assert.equal(containsPrivateFinancialDetail(line), false, line);
    }
});

test('blog repair remains severe-only and bounded while BioAI cron paths are separate', () => {
    const source = readFileSync(new URL('../src/handlers/scheduledBlog.js', import.meta.url), 'utf8');
    assert.match(source, /if \(!validation\.ok\) \{[\s\S]*?draft = await repairBlogDraft/);
    assert.equal((source.match(/draft = await repairBlogDraft/g) || []).length, 1);
    assert.match(source, /unapproved_financial_detail/);
    const daily = readFileSync(new URL('../src/handlers/scheduled.js', import.meta.url), 'utf8');
    assert.doesNotMatch(daily, /blogAuthorKnowledge|containsPrivateFinancialDetail|blogQuality/);
    for (const handler of ['handleScheduledDaily', 'handleScheduledOpportunity', 'handleScheduledProjectOpportunity']) {
        assert.ok(daily.includes(`export async function ${handler}`));
    }
});

test('both blog jobs consume current knowledge and publish with no extra model calls (offline)', async t => {
    const date = '2026-10-02';
    const paragraph = '我经营爱窝啦 AI 账号店，也一直在尝试 AI 一人公司。客服和教程的解释成本让我更重视真实交付。生命延续学项目仍需核验来源，公开样本能运行不等于有人需要它。';
    const output = `给自动化一次真实的验收\n\n${Array(6).fill(paragraph).join('\n\n')}\n\n## 参考资料\n\n- [原始研究](https://example.com/primary)`;
    const daily = '# 资讯\n\n' + 'Cursor、Claude 和衰老研究的新进展需要核验来源，不应从新闻推断本人参与过实验。\n'.repeat(10) + '\n[原始研究](https://example.com/primary)';
    const calls = [];
    const writes = [];
    t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
        if (String(url).startsWith('https://raw.githubusercontent.com/')) return new Response(daily);
        if (String(url).startsWith('https://example.invalid/')) {
            const payload = JSON.parse(options.body);
            const prompt = `${payload.system}\n${payload.messages[0].content}`;
            assert.match(payload.system, /个人博客写作内核/);
            assert.doesNotMatch(payload.messages[0].content, /个人博客写作内核/);
            assert.match(prompt, /核对至 2026-10-05/);
            assert.equal(containsUnapprovedFinancialDetail(prompt), false);
            calls.push(payload);
            const chunk = { type: 'content_block_delta', delta: { type: 'text_delta', text: output } };
            return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: {"type":"message_stop"}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
        }
        if (String(url).startsWith('https://api.github.com/')) {
            if (options.method === 'PUT') {
                writes.push(JSON.parse(options.body));
                return Response.json({ content: { sha: 'mock-committed' } });
            }
            return Response.json({ message: 'Not Found' }, { status: 404 });
        }
        throw new Error('Unexpected network destination in offline test');
    });
    const env = {
        USE_MODEL_PLATFORM: 'ANTHROPIC', ANTHROPIC_API_BASE_URL: 'https://example.invalid',
        ANTHROPIC_API_KEY: 'test-only-placeholder', DEFAULT_ANTHROPIC_MODEL: 'test-model',
        GITHUB_TOKEN: 'test-only-placeholder', GITHUB_REPO_OWNER: 'test-owner',
        GITHUB_REPO_NAME: 'BioAI-Daily-Web', BLOG_REPO_NAME: 'astro-paper', GITHUB_BRANCH: 'main',
        DATA_KV: { async put() {} },
    };
    const result = await handleScheduledBlog({}, env, {}, date);
    assert.equal(result.successCount, 2);
    assert.equal(calls.length, 2);
    assert.equal(writes.length, 2);
    assert.equal(env.GITHUB_REPO_NAME, 'BioAI-Daily-Web');
    for (const write of writes) {
        const article = Buffer.from(write.content, 'base64').toString('utf8');
        assert.match(article, /给自动化一次真实的验收/);
        assert.equal(containsPrivateFinancialDetail(article), false);
    }
});

test('automatic blogs do not inject financial statements even when previously authorized', () => {
    const statement = '2026-06-14，我记录的日营业额约3千元，日利润约1千元。';
    assert.equal(containsUnapprovedFinancialDetail(statement, '2026-10-04'), true);
    assert.equal(containsUnapprovedFinancialDetail('今天我的日利润约1千元。'), true);
    assert.equal(containsUnapprovedFinancialDetail('2026-10-02，我记录的月收入约5万元。', '2026-10-01'), true);
    assert.equal(containsUnapprovedFinancialDetail('2026-10-02，我记录的月净利润约5万元。'), true);
    assert.equal(containsUnapprovedFinancialDetail('经营 AI 账号店已经更忙。10 月 2 日记录的月收入约 5 万元。'), true);
    assert.equal(containsUnapprovedFinancialDetail('我关注企业产品。行业报告称某公司收入增长30%。'), false);
    assert.doesNotMatch(getBlogAuthorKnowledge('2026-10-04'), /博客日夜切换修复得到确认/);
});

test('author records are optional, relevant, series scoped, dated and bounded', () => {
    assert.deepEqual(selectBlogAuthorRecords('ai-daily', '2026-10-05', []), []);
    assert.deepEqual(selectBlogAuthorRecords('bioai-daily', '2026-10-05', ['植物外泌体与长寿奖项']), []);
    const bio = selectBlogAuthorRecords('bioai-daily', '2026-10-04', ['methylclock 公开样本与数据集']);
    assert.equal(bio.length, 2);
    assert.ok(bio.some(item => item.status === '工程实验'));
    assert.doesNotMatch(getBlogAuthorKnowledge('2026-10-04', 'bioai-daily', ['methylclock']), /客服|手机号|月收入/);
    assert.ok(selectBlogAuthorRecords('ai-daily', '2026-09-01', ['客服 知识库 交付 维护']).every(item => item.date <= '2026-09-01'));
    assert.ok(selectBlogAuthorRecords('ai-daily', null, ['客服 知识库 交付 维护 项目 一人公司']).length <= 3);
    for (const type of ['ai-daily', 'bioai-daily']) {
        const prompt = getBlogPrompt(type, '2026-10-05', ['研究新进展']);
        assert.doesNotMatch(prompt, /约3千元|约5万元|增长约2万元|主要产品线包括|我现在更真实的状态/);
        assert.match(prompt, /问题与读者的收获/);
    }
});

test('a useful first-person reflection does not require shop or persona stuffing', () => {
    const body = Array(5).fill('我更关心工具是否保留可检查的输出。自动生成后先核对输入和结果，再记录失败的步骤，能让下一次排查有依据。换成更复杂的系统以前，先确认重复工作具体发生在哪一环，避免引入新的维护任务。').join('\n\n');
    const result = validateBlogDraft({ title:'自动化先留下可检查的结果', body, dailyContent:'AI agent coding 工作流需要验证输出。\n'.repeat(20), blogType:'ai-daily' });
    assert.equal(result.ok, true, JSON.stringify(result));
});

test('useful later signals outrank opening roundups without extra model calls', () => {
    const daily = [
        ...Array.from({length: 7}, (_, i) => `AI 模型今日投稿量达到四万篇，宏观新闻摘要编号 ${i}。`),
        'Codex 工作流先验证需求，再检查代码与测试结果。',
        'Claude 技能和记忆管理需要明确输入与适用条件。',
        'Claude 官网自助下单，卡密秒发。',
    ].join('\n');
    const signals = selectBlogSignals(daily, 'ai-daily', 2);
    assert.equal(signals.length, 2);
    assert.match(signals[0], /验证需求/);
    assert.match(signals[1], /记忆管理/);
    assert.equal(selectBlogSignals(daily, 'ai-daily', 0).length, 0);
    assert.doesNotMatch(selectBlogSignals(daily, 'ai-daily', 20).join('\n'), /卡密秒发/);
    const bio = '长寿奖项获奖名单涉及多家公司和健康项目。\n随机对照临床研究需要核对样本、终点和生物标志物。';
    assert.match(selectBlogSignals(bio, 'bioai-daily', 1)[0], /随机对照/);
    const english = 'Longevity awards recognize ten companies in a broad field.\nMuscle biology features urolithin A in a randomized trial with a primary endpoint. ' + 'Details of the trial support interpretation. '.repeat(12);
    assert.match(selectBlogSignals(english, 'bioai-daily', 1)[0], /randomized/);
});

test('unsupported prompt habits are not mistaken for first-person judgments', () => {
    const dailyContent = 'Codex 与 Claude 工作流需要核对需求和结果。\n'.repeat(30);
    const base = '我更关心可检查的结果。将目标和限制写清楚，再核对输出，能避免理解偏差。'.repeat(12);
    for (const anecdote of ['我最常加的一句话变成了先复述需求。', '我通常会在任务描述后面加一句。', '这个习惯来自反复踩坑。', '我曾经以为给 AI 一个指令就够了。', '现在每次让 AI 做事之前，我会加一句。', '我见过不少这样的场景。']) {
        assert.ok(validateBlogDraft({title:'先核对理解再开始执行',body:base+anecdote,dailyContent,blogType:'ai-daily'}).severe.includes('unsupported_author_tool_routine'));
    }
    assert.equal(validateBlogDraft({title:'先核对理解再开始执行',body:base+'我的建议是先核对目标。例如，模糊的优化要求可能对应不同做法。',dailyContent,blogType:'ai-daily'}).ok, true);
});

test('generated FAQs and sales inserts do not become blog facts', () => {
    const input = '## 新闻\n工具支持记忆配置。\n> 官网自助下单，卡密秒发。\n## **相关问题**\n### Claude 工作流会保存吗？\n这里是不应作为原始事实的生成回答。\n## 开源项目\n真实仓库与来源。';
    const source = stripDailyBlogExtras(input);
    assert.match(source, /工具支持记忆配置/);
    assert.match(source, /真实仓库与来源/);
    assert.doesNotMatch(source, /相关问题|生成回答|工作流会保存|卡密秒发/);
    assert.equal(stripDailyBlogExtras(source), source);
});

test('native Anthropic system is blog opt-in; default daily payload is unchanged', async t => {
    const calls=[];
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
        calls.push(JSON.parse(options.body));
        return new Response('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\ndata: {"type":"message_stop"}\n\n');
    });
    const env={USE_MODEL_PLATFORM:'ANTHROPIC',ANTHROPIC_API_BASE_URL:'https://example.invalid',ANTHROPIC_API_KEY:'test-only-placeholder',DEFAULT_ANTHROPIC_MODEL:'test-model'};
    for(const native of [undefined,false,true]){
        for await(const _chunk of callChatAPIStream({...env,ANTHROPIC_NATIVE_SYSTEM_PROMPT:native},'source-data','editorial-rules')) {}
    }
    assert.equal(calls.length,3);
    for(const payload of calls.slice(0,2)){
        assert.equal(Object.hasOwn(payload,'system'),false);
        assert.deepEqual(payload.messages,[{role:'user',content:'editorial-rules\n\nsource-data'}]);
    }
    assert.equal(calls[2].system,'editorial-rules');
    assert.deepEqual(calls[2].messages,[{role:'user',content:'source-data'}]);
});

test('broad supplement safety assurances require repair, not publication', () => {
    const body='我更关心主要终点与肌肉力量的区别。研究信号需要保留对应的对象和测量口径。'.repeat(12)+'这种化合物有合理的假设、初步数据和明确的安全性记录。';
    const result=validateBlogDraft({title:'肌肉力量与主要终点的区别',body:body+'\n\n## 参考资料\n\n- [研究](https://example.com/study)',dailyContent:'临床肌肉研究需要核对实际终点。'.repeat(25)+'\nhttps://example.com/study',blogType:'bioai-daily'});
    assert.ok(result.severe.includes('unsupported_bio_safety_or_regulatory_claim'));
});

test('placeholder titles and unsupported tool success assurances do not pass', () => {
    const body='我的建议是有实质歧义时先确认任务边界，再根据结果核验执行是否正确。简单明确的改动可以直接完成。'.repeat(10);
    const dailyContent='Claude 与 Codex 工具需要验证任务。'.repeat(20);
    for(const title of ['BioAI 这条线，我先记一笔 2026/10/04','AI 工具这一轮变化，我先记一笔 2026/10/04']){
        assert.ok(validateBlogDraft({title,body,dailyContent,blogType:'ai-daily'}).severe.includes('fallback_or_daily_title'));
    }
    for(const claim of ['这个方法能拦住大半的理解偏差。','这不是模型问题，是沟通环节缺失。']){
        assert.ok(validateBlogDraft({title:'有歧义时先确认再执行',body:body+claim,dailyContent,blogType:'ai-daily'}).severe.includes('unsupported_tool_effectiveness_claim'));
    }
    assert.equal(validateBlogDraft({title:'有歧义时先确认再执行',body,dailyContent,blogType:'ai-daily'}).ok,true);
});
