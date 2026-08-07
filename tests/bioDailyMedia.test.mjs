import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractDailyMediaCandidates,
  extractDailyMediaUrlsFromHtml,
  normalizeDailyMediaUrl,
  prepareDailyCandidatesMedia,
} from '../src/bioDailyMedia.js';

test('extracts explicit, lazy-loaded and Open Graph images and resolves relative URLs', () => {
  const html = `
    <meta property="og:image" content="/cover.webp">
    <img data-src="https://cdn.example/figure.png" alt="figure">
  `;
  assert.deepEqual(extractDailyMediaUrlsFromHtml(html, 'https://journal.example/paper'), [
    'https://cdn.example/figure.png',
    'https://journal.example/cover.webp',
  ]);
  assert.deepEqual(extractDailyMediaCandidates({
    url: 'https://journal.example/paper',
    imageUrl: '/lead.jpg',
    details: { content_html: html },
  }), [
    'https://journal.example/lead.jpg',
    'https://cdn.example/figure.png',
    'https://journal.example/cover.webp',
  ]);
});

test('rejects private-network and non-http media URLs', () => {
  assert.equal(normalizeDailyMediaUrl('http://127.0.0.1/image.png'), '');
  assert.equal(normalizeDailyMediaUrl('data:image/png;base64,abc'), '');
});

test('keeps only reachable supported images and treats failures as non-blocking', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('good.jpg')) {
      return new Response('', { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '12000' } });
    }
    return new Response('', { status: 404, headers: { 'content-type': 'text/html' } });
  };
  const prepared = await prepareDailyCandidatesMedia([{
    title: 'Aging clock paper',
    url: 'https://arxiv.org/abs/2608.03145',
    source: 'arXiv',
    mediaCandidates: ['https://cdn.example/bad.svg', 'https://cdn.example/good.jpg'],
  }], { DAILY_MEDIA_DISCOVERY_CAP: '1' }, fetchImpl);
  assert.equal(prepared[0].media.length, 1);
  assert.equal(prepared[0].mediaUrl, 'https://cdn.example/good.jpg');
  assert.equal(prepared[0].hasMedia, true);
});
