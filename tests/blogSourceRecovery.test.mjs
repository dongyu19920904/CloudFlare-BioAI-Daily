import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBlogSourceContext, readBlogSource, resolveBlogSource } from '../src/blogSources.js';
import { recoverCachedBlogSource, handleScheduledBlog } from '../src/handlers/scheduledBlog.js';

const url = 'https://medicalxpress.com/news/2026-10-advanced-age-limit-benefits-sodium.html';
const other = 'https://www.news-medical.net/news/20261024/Massive-study-identifies-genetic-variants-associated-with-five-major-personality-traits.aspx';
const fullText = '公开研究说明了研究对象、观察方法和实际发现。研究结果只涉及这一组人，不能当成每个人的健康结论。'.repeat(15);
const item = { title: '公开衰老与健康研究', description: 'Short RSS summary only.', published_date: '2026-10-24T22:30:01Z', url };

// Delegation tests use a parser double; real selector behavior is checked in the Worker preview.
function mockParser(t, text = fullText) {
    const previous = globalThis.HTMLRewriter;
    const selectors = [];
    globalThis.HTMLRewriter = class {
        on(selector, handler) { selectors.push(selector); this.handler = handler; return this; }
        transform() {
            return { text: async () => { this.handler.element(); this.handler.text({ text }); return ''; } };
        }
    };
    t.after(() => { if (previous === undefined) delete globalThis.HTMLRewriter; else globalThis.HTMLRewriter = previous; });
    return selectors;
}

test('only the two supported public article paths can be enriched', () => {
    assert.equal(resolveBlogSource(url).kind, 'article');
    assert.equal(resolveBlogSource(other).selector, '[itemprop="articleBody"] p');
    assert.equal(resolveBlogSource(url + '?utm_source=rss#section').endpoint, url);
    for (const value of ['http://medicalxpress.com/news/2026-10-test.html', 'https://medicalxpress.com.evil.test/news/2026-10-test.html', 'https://medicalxpress.com@127.0.0.1/news/2026-10-test.html', 'https://medicalxpress.com:444/news/2026-10-test.html', 'https://medicalxpress.com/account', 'https://www.news-medical.net/account', 'https://127.0.0.1/news/2026-10-test.html']) assert.equal(resolveBlogSource(value), null);
});

test('article parsing is bounded, uses the expected selector and receives no credentials', async t => {
    const selectors = mockParser(t);
    const result = await readBlogSource(resolveBlogSource(url), { GITHUB_TOKEN: 'do-not-forward' }, async (endpoint, options) => {
        assert.equal(endpoint, url);
        assert.equal(options.redirect, 'manual');
        assert.equal(options.headers.Authorization, undefined);
        assert.ok(options.signal);
        return new Response('<html><article>Source</article></html>');
    });
    assert.equal(result.status, 'read');
    assert.ok(result.text.length >= 500);
    assert.deepEqual(selectors, ['article.news-article .article-main p']);
    assert.equal(JSON.stringify(result).includes('do-not-forward'), false);
    let calls = 0;
    const forged = await readBlogSource({ ...resolveBlogSource(url), endpoint: 'https://127.0.0.1/' }, {}, async () => { calls++; });
    assert.equal(forged.reason, 'source_not_allowed');
    assert.equal(calls, 0);
});

test('thin cache reads original prose without mutating cached data or writing KV', async t => {
    mockParser(t);
    const items = [item, { ...item, url: other }];
    const before = JSON.stringify(items);
    let calls = 0;
    const result = await recoverCachedBlogSource({ DATA_KV: { get: async key => { assert.equal(key, '2026-10-25-news'); return items; }, put: () => assert.fail('cache write') } }, '2026-10-25', async (endpoint, options) => {
        calls++;
        assert.equal(options.headers.Authorization, undefined);
        return endpoint === url ? new Response('<html>source</html>') : new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/' } });
    });
    assert.equal(calls, 2);
    assert.match(result.material, /公开研究说明/);
    assert.equal(result.receipts[1].reason, 'source_http_302');
    assert.equal(JSON.stringify(items), before);
    await buildBlogSourceContext(result.material, {}, () => assert.fail('duplicate original-source request'), result.receipts);
});

test('empty and filtered caches are distinct, and a short original stays rejected', async t => {
    const empty = await recoverCachedBlogSource({ DATA_KV: { get: async () => [] } }, '2026-10-25', () => assert.fail('empty cache fetched'));
    assert.equal(empty.reason, 'cache_empty');
    mockParser(t, '原网页也只有简短介绍。'.repeat(15));
    const filtered = await recoverCachedBlogSource({ DATA_KV: { get: async () => [item] } }, '2026-10-25', async () => new Response('<html>source</html>'));
    assert.equal(filtered.reason, 'cache_filtered_no_usable_source');
    assert.equal(filtered.material, '');
    assert.equal(filtered.receipts[0].status, 'read');
    assert.ok(filtered.receipts[0].characters < 500);
});

test('unsupported, future and duplicate links do not expand the two-request budget', async t => {
    mockParser(t);
    let calls = 0;
    const items = [{ ...item, url: 'https://localhost/x' }, { ...item, published_date: '2026-10-26T00:00:00Z' }, item, item, { ...item, url: other }, { ...item, url: 'https://medicalxpress.com/news/2026-10-third.html' }];
    const result = await recoverCachedBlogSource({ DATA_KV: { get: async () => items } }, '2026-10-25', async () => { calls++; return new Response('<html>source</html>'); });
    assert.equal(calls, 2);
    assert.equal(result.receipts.length, 2);
    assert.doesNotMatch(result.material, /localhost|2026-10-26|third.html/);
});

test('recovered originals select one aging-related subject instead of mixing unrelated research', async t => {
    mockParser(t);
    const items = [{ ...item, title: 'Massive genetic study of personality traits', url: other }, { ...item, title: 'Advanced age and chronic kidney disease' }];
    const result = await recoverCachedBlogSource({ DATA_KV: { get: async () => items } }, '2026-10-25', async () => new Response('<html>source</html>'));
    assert.match(result.material, /Advanced age and chronic kidney disease/);
    assert.doesNotMatch(result.material, /Massive genetic study/);
    assert.equal(result.receipts.length, 2);
});

test('single BioAI preview never regenerates AI posts or writes GitHub and KV', async t => {
    mockParser(t);
    let modelCalls = 0;
    let articleCalls = 0;
    const paragraph = '我更在意一项研究究竟观察了谁。研究对象和观察方法说清楚，读者才知道这项发现能回答什么。看到一个健康数字，先看它来自哪组人和哪种比较，再决定怎样理解。';
    t.mock.method(globalThis, 'fetch', async (endpoint, options = {}) => {
        const address = String(endpoint);
        if (address.startsWith('https://raw.githubusercontent.com/')) {
            assert.match(address, /BioAI-Daily-Web\/main\/daily\/2026-10-25.md/);
            return new Response('', { status: 404 });
        }
        if (address === url) { articleCalls++; return new Response('<html>source</html>'); }
        assert.equal(address, 'https://model.invalid/v1/messages');
        modelCalls++;
        const payload = JSON.parse(options.body);
        assert.match(payload.messages[0].content, /公开研究说明/);
        const text = '健康研究的数字先看适用于谁\n\n' + Array(7).fill(paragraph).join('\n\n') + `\n\n## 参考资料\n\n- [公开报道](${url})`;
        return new Response(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\ndata: {"type":"message_stop"}\n\n`);
    });
    const env = { USE_MODEL_PLATFORM: 'ANTHROPIC', ANTHROPIC_API_BASE_URL: 'https://model.invalid', ANTHROPIC_API_KEY: 'placeholder', DEFAULT_ANTHROPIC_MODEL: 'primary', GITHUB_REPO_OWNER: 'owner', DATA_KV: { get: async () => [item], put: () => assert.fail('preview status write') } };
    const result = await handleScheduledBlog({}, env, {}, '2026-10-25', { dryRun: true, previewType: 'bioai-daily' });
    assert.equal(result.success, true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].sourceRecovered, true);
    assert.equal(modelCalls, 1);
    assert.equal(articleCalls, 1);
});

test('single-type selection cannot silently become a partial production publish', async () => {
    await assert.rejects(handleScheduledBlog({}, {}, {}, '2026-10-25', { previewType: 'bioai-daily' }), /dryRun/);
    await assert.rejects(handleScheduledBlog({}, {}, {}, '2026-10-25', { dryRun: true, previewType: 'not-a-blog' }), /valid blog type/);
});
