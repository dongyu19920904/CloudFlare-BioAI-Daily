import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPublishedBlogs } from '../scripts/personal-blog-guard.mjs';

test('two actual article pages are required for visible publication', async () => {
    const calls = [];
    const result = await checkPublishedBlogs('2026-10-21', async url => {
        calls.push(url);
        return new Response('<html><article class="article-prose" id="article">正文</article></html>');
    });
    assert.equal(result.success, true);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(url => url.startsWith('https://yuyu.aivora.cn/posts/')));
});

test('missing pages, homepage fallbacks and network errors do not become generated success', async () => {
    for (const fetcher of [async () => new Response('not found', { status: 404 }), async () => new Response('<main>首页</main>'), async () => { throw new Error('offline'); }]) {
        const result = await checkPublishedBlogs('2026-10-21', fetcher);
        assert.equal(result.success, false);
        assert.ok(result.pages.every(page => !page.visible));
    }
});

test('publication checking does not trigger a model, Worker or GitHub write', async () => {
    const result = await checkPublishedBlogs('2026-10-21', async (url, options) => {
        assert.equal(options.method, undefined);
        assert.ok(!url.includes('workers.dev') && !url.includes('api.github.com'));
        return new Response('<article id="article">正文</article>');
    });
    assert.equal(result.success, true);
});

test('a redirect to a different article is not successful publication', async () => {
    const result = await checkPublishedBlogs('2026-10-21', async () => {
        const response = new Response('<article id="article">旧文章</article>');
        Object.defineProperty(response, 'redirected', { value: true });
        return response;
    });
    assert.equal(result.success, false);
});
