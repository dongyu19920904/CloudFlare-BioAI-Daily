import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCachedBlogSource, handleScheduledBlog } from '../src/handlers/scheduledBlog.js';
import { resolveGuardDate, validateTargetDate, validateWorkerUrl } from '../scripts/personal-blog-guard.mjs';

test('recovery dates select the due Shanghai day across month and year boundaries', () => {
    assert.equal(resolveGuardDate(new Date('2026-10-04T15:17:00Z')), '2026-10-04');
    assert.equal(resolveGuardDate(new Date('2026-10-04T23:17:00Z')), '2026-10-04');
    assert.equal(resolveGuardDate(new Date('2026-09-30T23:17:00Z')), '2026-09-30');
    assert.equal(resolveGuardDate(new Date('2026-12-31T23:17:00Z')), '2026-12-31');
    assert.throws(() => validateTargetDate('2026-02-30'));
    assert.throws(() => validateWorkerUrl('https://evil.example'));
    assert.throws(() => validateWorkerUrl('https://cloudflare-bioai-daily.sabrinamisan090.workers.dev.evil.example'));
});

test('cached input preserves real publication dates and rejects missing/future/refusal sources', () => {
    const item = { title:'Longevity project evidence', description:'Research into aging and clinical biomarkers. '.repeat(12), source:'Original publication', url:'https://example.com/research', published_date:'2026-10-02T12:00:00Z' };
    const source = buildCachedBlogSource([item, item, {...item,url:'https://example.com/future',published_date:'2026-10-05T01:00:00Z'}, {...item,url:'https://example.com/no-date',published_date:''}, {...item,url:'https://example.com/refusal',description:'我是 Claude Code，Anthropic 官方命令行工具。'}], '2026-10-04');
    assert.match(source, /2026-10-02T12:00:00Z/);
    assert.equal((source.match(/https:\/\/example.com\/research/g) || []).length, 1);
    assert.doesNotMatch(source, /future|no-date|refusal/);
    assert.equal(buildCachedBlogSource([], '2026-10-04'), '');
    const excerpt = buildCachedBlogSource([{...item,description:'A'.repeat(6000)}], '2026-10-04');
    assert.match(excerpt, /缓存摘录已截断/);
    assert.doesNotMatch(excerpt, /A{5001}/);
});

test('published blogs skip source fetch and model calls without mutating shared environment', async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (url, options={}) => {
        calls++;
        assert.match(String(url), /api.github.com\/repos\/owner\/astro-paper/);
        assert.equal(options.method, 'GET');
        return Response.json({sha:'existing'});
    });
    const env = Object.freeze({GITHUB_TOKEN:'placeholder',GITHUB_REPO_OWNER:'owner',GITHUB_REPO_NAME:'BioAI-Daily-Web'});
    const result = await handleScheduledBlog({},env,{},'2026-10-04');
    assert.equal(result.success, true);
    assert.equal(result.existingCount, 2);
    assert.equal(calls, 2);
});

test('recovery prefers substantive research to roundups and excludes headline-only snippets', () => {
    const item={description:'Research material with clinical study context and measurable outcomes. '.repeat(15),source:'Original report',published_date:'2026-10-02T12:00:00Z'};
    const items=Array.from({length:5},(_,i)=>({...item,title:`Longevity awards summit ${i}`,url:`https://example.com/award-${i}`}));
    items.push({...item,title:'Clinical trial expands its participant cohort',url:'https://example.com/trial'});
    items.push({...item,title:'Autophagy study',url:'https://example.com/thin',description:'Headline and short RSS introduction only.'});
    const original=JSON.stringify(items);
    const source=buildCachedBlogSource(items,'2026-10-04');
    assert.match(source,/example.com\/trial/);
    assert.doesNotMatch(source,/example.com\/thin/);
    assert.ok(source.indexOf('Clinical trial')<source.indexOf('Longevity awards'));
    assert.equal((source.match(/\n来源：/g)||[]).length,4);
    assert.equal(JSON.stringify(items),original);
    assert.equal(buildCachedBlogSource([{...item,description:'Short RSS only.'}],'2026-10-04'),'');
});
