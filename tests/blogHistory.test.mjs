import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessBlogNovelty, blogTextSimilarity, buildBlogHistoryContext, canonicalBlogSource, loadRecentBlogHistory, parseBlogHistory } from '../src/blogHistory.js';
import { getBlogReaderBrief, selectBlogWritingMaterial } from '../src/blogTopic.js';
import { handleScheduledBlog } from '../src/handlers/scheduledBlog.js';

const old = { date: '2026-11-05', title: '改一个功能之前，先问 AI 它还会动哪里', body: '改代码之前，先知道这次改动会波及哪里。先让 AI 列出调用方，再回到文件核对。', sources: ['https://github.com/owner/coding'] };
const article = `---\ntitle: '${old.title}'\npubDatetime: 2026-11-05T01:00:00Z\n---\n\n${old.body}\n\n## 参考资料\n- [项目](https://github.com/owner/coding?utm_source=rss)\n\n---\n> [日报](https://news.aivora.cn/2026-11/2026-11-05/)`;

test('history parses generated frontmatter and actual references, not the daily footer', () => {
    const parsed = parseBlogHistory(article, old.date);
    assert.equal(parsed.title, old.title);
    assert.deepEqual(parsed.sources, old.sources);
    assert.equal(parsed.body, old.body);
    assert.equal(parseBlogHistory('没有标题的旧文件', old.date), null);
    assert.equal(parseBlogHistory(article.replace(`'${old.title}'`, JSON.stringify(old.title)), old.date).title, old.title);
});

test('exact titles, paraphrased impact angles and copied body cannot pass as new work', () => {
    assert.ok(assessBlogNovelty({ title: old.title, body: '完全不同的新正文。' }, [old]).includes('repeated_blog_title'));
    for (const title of ['改一个函数之前，先看它被谁用过', '改一个功能之前，先让 AI 说出它会动哪些地方', '让 AI 改功能之前，先弄清影响几处']) {
        assert.ok(assessBlogNovelty({ title, body: '改动代码时，先确认调用方与依赖，再回到相关文件核对影响。' }, [old]).includes('repeated_blog_angle'), title);
    }
    const body = '找资料时应记录出处，给结论保留原始链接，不将摘要当作完整原文。'.repeat(12);
    assert.ok(assessBlogNovelty({ title: '换了一个标题也不能重发同一篇', body }, [{ ...old, body }]).includes('repeated_blog_content'));
    assert.equal(blogTextSimilarity('', ''), 0);
});

test('a brand name alone does not force the same question or block a distinct topic', () => {
    for (const material of ['Codex 新增语音输入。', 'Claude Code 的额度政策。', 'Cursor 的图片界面。']) {
        assert.doesNotMatch(getBlogReaderBrief(material, 'ai-daily'), /本篇唯一问题：让 AI 改/);
        assert.deepEqual(assessBlogNovelty({ title: material, body: '讨论输入方式、使用条件和来源中真实变化。' }, [old]), []);
    }
});

test('source replay is normalized and selection changes before spending a model call', () => {
    const code = '### Codex 编程工具\n\n' + '项目支持检查代码。'.repeat(30) + '\n[项目](https://github.com/owner/coding?utm_source=weekly#readme)';
    const audio = '### AI 语音笔记工具\n\n' + '工具将语音整理成可检索的笔记，用户可以查看原始记录。'.repeat(15) + '\n[说明](https://example.org/audio)';
    assert.equal(selectBlogWritingMaterial(code + '\n\n' + audio, 'ai-daily', [old]), audio);
    assert.equal(selectBlogWritingMaterial(code, 'ai-daily', [old]), '');
    assert.equal(canonicalBlogSource('https://example.org/doc?id=3&utm_source=x#part'), 'https://example.org/doc?id=3');
    assert.ok(buildBlogHistoryContext([old]).includes(old.title));
});

test('history loading is bounded by column, past seven days, branch and fixed API host', async () => {
    const requests = [];
    const posts = await loadRecentBlogHistory({ GITHUB_TOKEN: 'placeholder', GITHUB_REPO_OWNER: 'owner', BLOG_REPO_NAME: 'personal', BLOG_REPO_BRANCH: 'release' }, 'ai-daily', '2026-11-07', async (url, options) => {
        requests.push(url);
        assert.equal(new URL(url).host, 'api.github.com');
        assert.equal(new URL(url).searchParams.get('ref'), 'release');
        assert.equal(options.redirect, 'error');
        if (requests.length === 1) return Response.json(['ai-daily-2026-10-30.md', 'ai-daily-2026-10-31.md', 'ai-daily-2026-11-05.md', 'ai-daily-2026-11-07.md', 'bioai-daily-2026-11-06.md'].map(name => ({ name })));
        return new Response(article);
    });
    assert.deepEqual(posts.map(post => post.date), ['2026-11-05', '2026-10-31']);
    assert.equal(requests.length, 3);
    await assert.rejects(loadRecentBlogHistory({ GITHUB_TOKEN: 'placeholder', GITHUB_REPO_OWNER: 'owner' }, 'ai-daily', '2026-11-07', async () => new Response('', { status: 503 })), /history unavailable/);
});

test('history failure stays inside the personal blog job and does not call a model or publish', async t => {
    t.mock.method(globalThis, 'fetch', async url => {
        if (String(url).includes('raw.githubusercontent.com')) return new Response('## Claude 工具\n' + '有真实材料和来源。'.repeat(100) + '\nhttps://example.org/tool');
        if (String(url).startsWith('https://api.github.com/')) return new Response('', { status: 503 });
        assert.fail('no model or publication after history failure');
    });
    const result = await handleScheduledBlog({}, { GITHUB_TOKEN: 'placeholder', GITHUB_REPO_OWNER: 'owner' }, {}, '2026-11-07', { dryRun: true, previewType: 'ai-daily' });
    assert.equal(result.results[0].status, 'failed');
    assert.match(result.results[0].error, /history unavailable/);
    const scheduler = readFileSync(new URL('../src/handlers/scheduledBlog.js', import.meta.url), 'utf8');
    assert.doesNotMatch(scheduler, /handleScheduledDaily|handleScheduledOpportunity|handleScheduledProject/);
});

for (const repeated of [false, true]) {
    test(`real blog chain ${repeated ? 'refuses a repeat after its one existing repair' : 'uses history without an extra model review'}`, async t => {
        let calls = 0;
        const fresh = '### AI 语音笔记工具让原始内容能够随时找回\n\n' + '工具保留原始记录，方便从文字找回语音内容，不要编造使用经历。'.repeat(15) + '\n[说明](https://example.com/research)';
        const body = repeated ? '改代码前先确认调用方和依赖，改动会影响哪些地方，需要回到相关文件核对。'.repeat(15) : '整理语音时需要保留原始记录，文字摘要可以帮助定位。找到原来的那句话以后，再判断概括有没有遗漏条件。工具整理的结果也需要核对，不凭一句简短摘要猜出原本没有的话。'.repeat(7);
        const output = `${repeated ? old.title : '用语音笔记找回一句原始记录'}\n\n${body}\n\n## 参考资料\n- [说明](https://example.com/research)`;
        t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
            if (String(url).includes('raw.githubusercontent.com')) return new Response(fresh);
            if (String(url).startsWith('https://api.github.com/')) {
                assert.equal(options.method, 'GET');
                if (new URL(url).pathname.endsWith('/contents/src/data/blog')) return Response.json([{ name: 'ai-daily-2026-11-05.md' }]);
                return new Response(article);
            }
            assert.equal(String(url), 'https://model.invalid/v1/messages');
            const payload = JSON.parse(options.body);
            assert.ok(payload.messages[0].content.includes(old.title));
            calls++;
            return new Response(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: output } })}\n\ndata: {"type":"message_stop"}\n\n`);
        });
        const env = { USE_MODEL_PLATFORM: 'ANTHROPIC', ANTHROPIC_API_BASE_URL: 'https://model.invalid', ANTHROPIC_API_KEY: 'placeholder', DEFAULT_ANTHROPIC_MODEL: 'fixture', GITHUB_TOKEN: 'placeholder', GITHUB_REPO_OWNER: 'owner', DATA_KV: { put() { assert.fail('no status writes'); } } };
        const result = await handleScheduledBlog({}, env, {}, '2026-11-07', { dryRun: true, previewType: 'ai-daily' });
        assert.equal(calls, repeated ? 2 : 1);
        assert.equal(result.results[0].status, repeated ? 'skipped' : 'preview');
        if (repeated) assert.match(result.results[0].reason, /repeated_blog/);
        else assert.equal(result.results[0].recentPosts[0].title, old.title);
    });
}
