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

test('enforces a global image probe budget', async () => {
  let probeCount = 0;
  const fetchImpl = async () => {
    probeCount += 1;
    return new Response('', { status: 404, headers: { 'content-type': 'text/html' } });
  };
  const candidates = Array.from({ length: 4 }, (_, index) => ({
    title: `Candidate ${index}`,
    url: `https://example.org/${index}`,
    mediaCandidates: [
      `https://images.example.org/${index}-a.jpg`,
      `https://images.example.org/${index}-b.jpg`,
    ],
  }));

  const prepared = await prepareDailyCandidatesMedia(candidates, {
    DAILY_MEDIA_PROBE_CAP: '2',
    DAILY_MEDIA_PROBES_PER_CANDIDATE: '2',
  }, fetchImpl);

  assert.equal(probeCount, 4, 'two failed URL probes may each use HEAD and GET');
  assert.equal(prepared.length, 4);
  assert.equal(prepared.some((candidate) => candidate.hasMedia), false);
});
