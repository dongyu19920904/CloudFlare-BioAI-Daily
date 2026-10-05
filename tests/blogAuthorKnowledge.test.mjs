import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getBlogPrompt } from '../src/prompt/blogPrompt.js';
import { getBlogAuthorKnowledge } from '../src/prompt/blogAuthorKnowledge.js';
import { containsPrivateFinancialDetail, containsUnapprovedFinancialDetail, validateBlogDraft } from '../src/blogQuality.js';
import { handleScheduledBlog } from '../src/handlers/scheduledBlog.js';

test('production blog prompt loads dated public knowledge without old financial state', () => {
    const knowledge = getBlogAuthorKnowledge();
    assert.match(knowledge, /核对至 2026-10-05/);
    assert.match(knowledge, /\[计划\]/);
    assert.match(knowledge, /\[工程实验\]/);
    for (const type of ['ai-daily', 'bioai-daily']) {
        const prompt = getBlogPrompt(type);
        assert.ok(prompt.includes(knowledge));
        assert.doesNotMatch(prompt, /现在月入稳定几千|每天销售额大约|每天利润大约|半躺平的生活/);
        assert.equal(containsUnapprovedFinancialDetail(prompt), false);
        assert.match(prompt, /外部事实，不证明 yuyu/);
    }
});

test('public knowledge has no raw diary identifiers, credentials or private endpoints', () => {
    const raw = readFileSync(new URL('../src/prompt/blogAuthorKnowledge.json', import.meta.url), 'utf8');
    assert.doesNotMatch(raw, /sk-[A-Za-z0-9]{20,}|refresh_token|creationDate|lastModified|[A-Z]:\\|threadId|noteId|\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    const knowledge = JSON.parse(raw);
    assert.equal(knowledge.publicFinancialStatements.length, 3);
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
            const prompt = payload.messages[0].content;
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

test('authorized historical finances retain date, metric and thousand precision', () => {
    const statement = '2026-06-14，我记录的日营业额约3千元，日利润约1千元。';
    assert.equal(containsUnapprovedFinancialDetail(statement, '2026-10-04'), false);
    assert.equal(containsUnapprovedFinancialDetail('今天我的日利润约1千元。'), true);
    assert.equal(containsUnapprovedFinancialDetail('2026-10-02，我记录的月收入约5万元。', '2026-10-01'), true);
    assert.equal(containsUnapprovedFinancialDetail('2026-10-02，我记录的月净利润约5万元。'), true);
    assert.equal(containsUnapprovedFinancialDetail('经营 AI 账号店已经更忙。10 月 2 日记录的月收入约 5 万元。'), true);
    assert.equal(containsUnapprovedFinancialDetail('我关注企业产品。行业报告称某公司收入增长30%。'), false);
    assert.doesNotMatch(getBlogAuthorKnowledge('2026-10-04'), /博客日夜切换修复得到确认/);
});
