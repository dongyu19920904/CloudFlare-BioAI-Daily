import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBlogSourceContext, resolveBlogSource } from '../src/blogSources.js';
import { normalizeGeneratedMarkdown, validateBlogDraft } from '../src/blogQuality.js';

test('a bare approved reference becomes a real link without inventing a source', () => {
    const url = 'https://arxiv.org/abs/2610.28411';
    const result = normalizeGeneratedMarkdown('文章正文。\n\n## 参考资料\n\n- ' + url, [url]);
    assert.ok(result.includes(`[来源原文](${url})`));
    assert.equal(normalizeGeneratedMarkdown(result, [url]), result);
    assert.ok(!normalizeGeneratedMarkdown('## 参考资料\nhttps://unapproved.invalid/research', [url]).includes('[来源原文]'));
});

test('source requests are confined to repository READMEs and identified abstracts', () => {
    assert.equal(resolveBlogSource('https://github.com/CBICA/Brain2Vec#readme').endpoint, 'https://api.github.com/repos/CBICA/Brain2Vec/readme');
    assert.equal(resolveBlogSource('https://papers.cool/arxiv/2610.28411').url, 'https://arxiv.org/abs/2610.28411');
    for (const url of ['http://github.com/a/b', 'https://github.com.evil.test/a/b', 'https://github.com@127.0.0.1/a/b', 'https://github.com/a/b/issues/1', 'https://localhost/x', 'https://arxiv.org:444/abs/2610.28411', 'https://arxiv.org/abs/not-a-paper']) assert.equal(resolveBlogSource(url), null, url);
});

test('primary model access conditions enter the actual writing input with provenance', async () => {
    const source = 'Our model is a research encoder. '.repeat(6) + '\n\nTo use our model, you need to apply for access to the model card.\n\nCode is public.';
    const calls = [];
    const result = await buildBlogSourceContext('摘要声称权重已开源。[项目](https://github.com/example/brain)', { GITHUB_TOKEN: 'placeholder' }, async (url, options) => {
        calls.push(url);
        assert.equal(options.headers.Authorization, 'Bearer placeholder');
        assert.equal(options.redirect, 'manual');
        return new Response(source);
    });
    assert.equal(calls.length, 1);
    assert.equal(result.receipts[0].status, 'read');
    assert.equal(result.receipts[0].accessRestricted, true);
    assert.ok(result.material.includes('apply for access'));
    assert.ok(result.material.includes('二手选题摘录'));
    assert.ok(!result.material.includes('Bearer'));
});

test('abstract requests never receive the GitHub token and parser failure is explicit', async () => {
    const result = await buildBlogSourceContext('https://arxiv.org/abs/2610.28411', { GITHUB_TOKEN: 'placeholder' }, async (url, options) => {
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(options.redirect, 'manual');
        return new Response('<html>abstract</html>');
    });
    assert.equal(result.receipts[0].status, 'unavailable');
    assert.equal(result.receipts[0].reason, 'html_parser_unavailable');
});

test('redirects and source failures remain unavailable without inventing evidence', async () => {
    const result = await buildBlogSourceContext('https://github.com/a/one\nhttps://github.com/b/two', {}, async url => {
        if (url.includes('/one/')) return new Response(null, { status: 302, headers: { Location: 'https://other.test/' } });
        throw new Error('network token=not-for-logs');
    });
    assert.deepEqual(result.receipts.map(item => item.status), ['unavailable', 'unavailable']);
    assert.equal(result.receipts[0].reason, 'source_http_302');
    assert.equal(result.receipts[1].reason, 'source_fetch_failed');
    assert.ok(!result.material.includes('not-for-logs'));
});

test('a real README can begin with HTML badges without being an HTML error page', async () => {
    const result = await buildBlogSourceContext('https://github.com/a/one', {}, async () => new Response('<p align="center"><img src="logo.png"></p>\n\n# Project\n' + 'Public project instructions and supported usage. '.repeat(10)));
    assert.equal(result.receipts[0].status, 'read');
    const error = await buildBlogSourceContext('https://github.com/a/one', {}, async () => new Response('<!DOCTYPE html><html>' + 'An error page. '.repeat(20) + '</html>'));
    assert.equal(error.receipts[0].status, 'unavailable');
});

test('source work is deduplicated, capped and honestly marks truncated excerpts', async () => {
    let calls = 0;
    const result = await buildBlogSourceContext('https://github.com/a/one#readme\nhttps://github.com/a/one\nhttps://github.com/b/two\nhttps://github.com/c/three', {}, async () => {
        calls++;
        return new Response('A'.repeat(20000) + 'TAIL');
    });
    assert.equal(calls, 2);
    assert.ok(result.receipts.every(item => item.truncated));
    assert.ok(result.receipts[0].text.endsWith('TAIL'));
    assert.ok(result.receipts[0].text.length < 16100);
    const oversized = await buildBlogSourceContext('https://github.com/a/one', {}, async () => new Response('x'.repeat(300000)));
    assert.equal(oversized.receipts[0].reason, 'source_too_large');
});

test('access contradiction uses the existing severe gate without blocking correct explanations', () => {
    const base = { title: '读懂脑年龄研究公开了什么', dailyContent: '脑年龄与 AI 研究。'.repeat(30), blogType: 'bioai-daily', sourceReceipts: [{ status: 'read', accessRestricted: true }] };
    assert.ok(validateBlogDraft({ ...base, body: '模型权重已开源，可以任意下载。'.repeat(25) }).severe.includes('source_access_overclaim'));
    assert.ok(!validateBlogDraft({ ...base, body: '代码公开，权重需要申请访问。'.repeat(30) }).severe.includes('source_access_overclaim'));
    assert.ok(!validateBlogDraft({ ...base, body: '代码公开不代表权重可以自由下载。'.repeat(30) }).severe.includes('source_access_overclaim'));
    assert.ok(!validateBlogDraft({ ...base, body: '训练权重不是任意下载的，需要申请访问。'.repeat(30) }).severe.includes('source_access_overclaim'));
});

test('source enrichment is personal-blog-only and does not add a model stage', () => {
    const blog = readFileSync(new URL('../src/handlers/scheduledBlog.js', import.meta.url), 'utf8');
    assert.equal((blog.match(/draft = await repairBlogDraft/g) || []).length, 1);
    assert.ok(blog.includes('await buildBlogSourceContext(dailyContent, env)'));
    for (const path of ['scheduled.js', 'genAIContent.js']) {
        const source = readFileSync(new URL('../src/handlers/' + path, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /blogSources|blogReadability|blogTopic/);
    }
});
