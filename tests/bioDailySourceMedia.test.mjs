import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichBioDailySourceMedia } from '../src/bioDailySourceMedia.js';
import { getBioDailyMediaUrl, restoreBioDailySourceMedia, getBioDailyReadabilityDiagnostics } from '../src/bioDailyMarkdown.js';

const source = 'https://www.fightaging.org/archives/2026/10/study/';
const article = 'https://news.mit.edu/2026/nk-cell-study-1013';
const image = 'https://news.mit.edu/sites/default/files/images/202610/nk-cells.jpg';
const body = `## **🔥 今日焦点 TOP 1**\n\n### 1. 免疫细胞研究\n\n据[研究报道](${source})，小鼠中观察到信号，还不能推到人体。`;
const candidates = [{ url: source, title: 'NK cells', contentHtml: `<a href="${article}">University report</a>` }];
const html = value => new Response(value, { headers: { 'content-type': 'text/html' } });

test('source image enrichment reads only a cited, explicitly linked institution article', async () => {
  const calls = [];
  const result = await enrichBioDailySourceMedia(body, candidates, async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    return html(`<meta content="${image}" property="og:image">`);
  });
  assert.deepEqual(calls, [article]);
  assert.equal(result.candidates[0].mediaUrl, image);
  assert.equal(result.diagnostics.added, 1);
  assert.match(restoreBioDailySourceMedia(body, result.candidates), /nk-cells\.jpg/);
  assert.equal(candidates[0].mediaUrl, undefined, 'do not mutate source cache');
});

test('unselected, FAQ-only, unsafe and redirect links do not expand the fetch boundary', async () => {
  const attempts = [];
  const inputs = [...candidates, { url: 'https://example.org/not-cited', contentHtml: `<a href="${article}">Article</a>` }];
  inputs[0] = { ...inputs[0], contentHtml: [
    'http://127.0.0.1/private', 'https://news.mit.edu.evil.example/2026/study',
    'https://user:password@news.mit.edu/2026/study', 'https://news.mit.edu:8443/2026/study',
    'https://news.mit.edu/', article,
  ].map(url => `<a href="${url}">Article</a>`).join('') };
  const result = await enrichBioDailySourceMedia(body, inputs, async url => {
    attempts.push(url);
    return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  });
  assert.deepEqual(attempts, [article]);
  assert.equal(result.diagnostics.added, 0);
  assert.equal(result.candidates[0].mediaUrl, undefined);
  const faqOnly = `## **❓ 相关问题**\n### 能用于人体吗？\n[报道](${source})不能外推。`;
  await enrichBioDailySourceMedia(faqOnly, candidates, () => assert.fail('FAQ is not a news image slot'));
});

test('enrichment has three-request hard cap, isolates failures, rejects logos and oversized HTML', async () => {
  const items = Array.from({ length: 6 }, (_, n) => ({ url: `https://news.mit.edu/2026/study-${n}`, title: `Study ${n}` }));
  const report = items.map(item => `### ${item.title}\n\n[大学报道](${item.url})小鼠研究。`).join('\n\n');
  let calls = 0;
  const result = await enrichBioDailySourceMedia(report, items, async () => {
    calls++;
    if (calls === 1) throw new Error('fixture unavailable');
    if (calls === 2) return html('<meta property="og:image" content="https://news.mit.edu/sites/default/files/logo.jpg">');
    return html(`<meta property="og:image" content="${image}">`);
  });
  assert.equal(calls, 3);
  assert.equal(result.diagnostics.added, 1);
  const big = await enrichBioDailySourceMedia(body, candidates, async () => html('x'.repeat(350001)));
  assert.equal(big.diagnostics.added, 0);
});

test('image extraction supports lazy original images, not video enclosures or trackers', () => {
  assert.equal(getBioDailyMediaUrl({ details: { imageUrl: 'https://example.org/video.mp4', content_html: '<img src="https://example.org/pixel.gif" width="1" height="1"><img data-src="https://example.org/experiment.png" alt="实验示意">' } }), 'https://example.org/experiment.png');
  assert.equal(getBioDailyMediaUrl({ imageUrl: 'https://example.org/logo.png' }), '');
});

test('restoration never borrows an unrelated image and caps the edition instead of every story', () => {
  const inputs = Array.from({ length: 8 }, (_, n) => ({ url: `https://example.org/study-${n}`, title: `Study ${n}`, mediaUrl: `https://example.org/figure-${n}.jpg` }));
  const report = inputs.map(item => `### ${item.title}\n\n[来源](${item.url})动物研究。`).join('\n\n');
  const output = restoreBioDailySourceMedia(report, inputs);
  assert.equal((output.match(/!\[/g) || []).length, 4);
  assert.equal(restoreBioDailySourceMedia(output, inputs), output);
  assert.doesNotMatch(restoreBioDailySourceMedia(body, inputs), /!\[/);
});

test('readability diagnostics count prose, not URLs, image captions or FAQ, without truncation', () => {
  const draft = `### 1. 标题\n\n[报道](https://example.org/${'long'.repeat(200)})${'甲'.repeat(225)}\n\n[![不计图注](https://example.org/figure.jpg "不计图注")](https://example.org/study)\n\n## **❓ 相关问题**\n### 怎么判断？\n${'乙'.repeat(240)}`;
  assert.deepEqual(getBioDailyReadabilityDiagnostics(draft), { items: 1, meanHan: 227, overlong: [{ item: 1, han: 227 }] });
  assert.ok(draft.includes('甲'.repeat(225)), 'never delete evidence just to satisfy a count');
});
