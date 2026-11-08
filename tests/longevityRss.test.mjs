import test from "node:test";
import assert from "node:assert/strict";

import {
  LongevityNewsRssDataSource,
  PapersCoolDataSource,
  itemMatchesPapersCoolTopic,
} from "../src/dataSources/longevity-rss.js";
import { getISODate, setFetchDate } from "../src/helpers.js";

const originalFetch = globalThis.fetch;
const originalFetchDate = getISODate();

test('paper RSS diagnoses exclusions, preserves publication dates and dedupes before its cap', async () => {
  const entry = (id, title, summary, dates) => `<entry><id>https://papers.cool/arxiv/${id}</id><title>${title}</title><summary>${summary}</summary>${dates}</entry>`;
  const xml = `<feed>${[
    entry('2611.00001', 'AI drug discovery', 'LLM agents design proteins.', '<published>2026-11-05</published><updated>2026-11-08</updated>'),
    entry('2611.00001v2', 'AI drug discovery', 'LLM agents design proteins.', '<published>2026-11-05</published>'),
    entry('2611.00002', 'AI aging clock', 'Machine learning predicts biological age.', '<published>2026-11-04</published>'),
    entry('2611.00003', 'Robot cognition', 'Brain-inspired AI neural network manipulation.', '<published>2026-11-05</published>'),
    entry('2611.00004', 'AI protein design', 'LLM designs proteins.', ''),
    entry('2610.00005', 'AI protein design', 'LLM designs proteins.', '<published>2026-10-01</published><updated>2026-11-08</updated>'),
  ].join('')}</feed>`;
  globalThis.fetch = async () => new Response(xml);
  setFetchDate('2026-11-09');
  try {
    const raw = await PapersCoolDataSource.fetch({ PAPERS_COOL_RSS_URLS: 'AI::https://papers.cool/arxiv/cs.AI/feed', PAPERS_COOL_MAX_ITEMS_PER_FEED: '2' });
    assert.equal(raw.items.length, 2);
    assert.match(raw.items[0].title, /aging clock/);
    const feed = raw.diagnostics.feeds[0];
    assert.equal(feed.fetched, 6);
    assert.equal(feed.topicRejected, 1);
    assert.equal(feed.dateRejected, 2);
    assert.equal(feed.duplicates, 1);
    assert.equal(feed.selected, 2);
    const transformed = PapersCoolDataSource.transform(raw, 'paper');
    const drug = transformed.find(item => item.title === 'AI drug discovery');
    assert.equal(drug.published_date, '2026-11-05');
    assert.equal(drug.details.updatedAt, '2026-11-08');
  } finally {
    globalThis.fetch = originalFetch;
    setFetchDate(originalFetchDate);
  }
});

test('one failed paper feed does not discard other feeds or exceed the configured feed count', async () => {
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    if (url.endsWith('/q-bio/feed')) throw new Error('fixture offline');
    return new Response('<feed><entry><title>AI drug discovery</title><id>https://papers.cool/arxiv/2611.00001</id><summary>LLM protein design.</summary><published>2026-11-05</published></entry></feed>');
  };
  setFetchDate('2026-11-09');
  try {
    const raw = await PapersCoolDataSource.fetch({ PAPERS_COOL_MAX_FEEDS_PER_RUN: '2' });
    assert.equal(requests.length, 2);
    assert.equal(raw.items.length, 1);
    assert.equal(raw.diagnostics.feeds[0].status, 'error');
  } finally {
    globalThis.fetch = originalFetch;
    setFetchDate(originalFetchDate);
  }
});

test('paper RSS rejects oversized and non-feed responses without returning misleading items', async () => {
  setFetchDate('2026-11-09');
  try {
    for (const body of ['<html>Temporary upstream error</html>', '<feed>' + 'x'.repeat(2 * 1024 * 1024) + '</feed>']) {
      globalThis.fetch = async () => new Response(body);
      const raw = await PapersCoolDataSource.fetch({ PAPERS_COOL_MAX_FEEDS_PER_RUN: '1' });
      assert.deepEqual(raw.items, []);
      assert.equal(raw.diagnostics.feeds[0].status, 'error');
    }
  } finally {
    globalThis.fetch = originalFetch;
    setFetchDate(originalFetchDate);
  }
});

test('explicit paper keyword restrictions still apply without admitting generic AI', async () => {
  globalThis.fetch = async () => new Response('<feed><entry><title>AI drug discovery</title><id>https://papers.cool/arxiv/2611.00001</id><summary>LLM protein design.</summary><published>2026-11-05</published></entry></feed>');
  setFetchDate('2026-11-09');
  try {
    const raw = await PapersCoolDataSource.fetch({ PAPERS_COOL_MAX_FEEDS_PER_RUN: '1', PAPERS_COOL_AI_KEYWORDS: 'custom-model', PAPERS_COOL_STRONG_KEYWORDS: 'custom-object' });
    assert.deepEqual(raw.items, []);
    assert.equal(raw.diagnostics.feeds[0].topicReasons.configured_keyword_filter, 1);
  } finally {
    globalThis.fetch = originalFetch;
    setFetchDate(originalFetchDate);
  }
});

test('daily paper relevance rejects generic model pruning but retains biological methods', () => {
  assert.equal(itemMatchesPapersCoolTopic({ title: 'Your Transformer Is Secretly Elastic', summary: 'Retraining-free pruning for ImageNet vision and text encoders on A100 GPUs.' }, {}), false);
  assert.equal(itemMatchesPapersCoolTopic({ title: 'Neural Wasserstein Splines', summary: 'Neural network trajectory inference evaluated on single-cell benchmarks.' }, {}), true);
});

test("papers.cool Atom feed is filtered for BioAI relevance", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>https://papers.cool/arxiv/2606.09558</id>
    <title>Integrating gene regulatory priors into Transformer attention with scTransformer</title>
    <updated>2026-06-08T14:32:52+00:00</updated>
    <author><name>Alice</name></author>
    <link href="https://papers.cool/arxiv/2606.09558"/>
    <summary>Transformer-based models for single-cell transcriptomics improve biological interpretability.</summary>
  </entry>
  <entry>
    <id>https://papers.cool/arxiv/2606.09494</id>
    <title>Percolation and clustering in ecological communities</title>
    <updated>2026-06-08T13:47:52+00:00</updated>
    <author><name>Bob</name></author>
    <link href="https://papers.cool/arxiv/2606.09494"/>
    <summary>A dynamical theory for ecological communities.</summary>
  </entry>
</feed>`,
  });
  setFetchDate("2026-06-09");

  try {
    const raw = await PapersCoolDataSource.fetch({
      PAPERS_COOL_RSS_URLS: "Papers.cool::https://papers.cool/arxiv/q-bio/feed",
      PAPERS_COOL_FILTER_DAYS: "7",
      PAPERS_COOL_MAX_FEEDS_PER_RUN: "1",
      PAPERS_COOL_MAX_ITEMS_PER_FEED: "12",
    });
    const items = PapersCoolDataSource.transform(raw, "paper");

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Integrating gene regulatory priors into Transformer attention with scTransformer");
    assert.equal(items[0].source, "Papers.cool");
    assert.equal(items[0].details.dateBasis, 'updated_only');
    assert.match(PapersCoolDataSource.generateHtml(items[0]), /原始发表日期未知/);
    assert.match(items[0].details.content_html, /arxiv\.org\/pdf\/2606\.09558/);
  } finally {
    setFetchDate(originalFetchDate);
    globalThis.fetch = originalFetch;
  }
});

test("papers.cool default feeds include AI categories and respect feed limits", async () => {
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return {
      ok: true,
      text: async () => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"></feed>`,
    };
  };

  try {
    await PapersCoolDataSource.fetch({
      PAPERS_COOL_MAX_FEEDS_PER_RUN: "3",
      PAPERS_COOL_MAX_ITEMS_PER_FEED: "8",
      PAPERS_COOL_FILTER_DAYS: "7",
    });

    assert.deepEqual(requestedUrls, [
      "https://papers.cool/arxiv/q-bio/feed",
      "https://papers.cool/arxiv/cs.LG/feed",
      "https://papers.cool/arxiv/cs.AI/feed",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RSS news feed extracts image media", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>AI longevity platform launches new biomarker dashboard</title>
      <link>https://example.com/bioai-dashboard</link>
      <pubDate>Tue, 09 Jun 2026 00:00:00 GMT</pubDate>
      <description><![CDATA[<p>A new biomarker dashboard for longevity research.</p>]]></description>
      <media:content url="https://example.com/image.jpg" medium="image"/>
    </item>
  </channel>
</rss>`,
  });
  setFetchDate("2026-06-09");

  try {
    const raw = await LongevityNewsRssDataSource.fetch({
      LONGEVITY_NEWS_RSS_URLS: "Example::https://example.com/feed.xml",
      LONGEVITY_NEWS_FILTER_DAYS: "3",
      LONGEVITY_NEWS_MAX_FEEDS_PER_RUN: "1",
      LONGEVITY_NEWS_MAX_ITEMS_PER_FEED: "5",
    });
    const items = LongevityNewsRssDataSource.transform(raw, "news");

    assert.equal(items.length, 1);
    assert.equal(items[0].details.imageUrl, "https://example.com/image.jpg");
    assert.match(items[0].details.content_html, /<img src="https:\/\/example\.com\/image\.jpg"/);
  } finally {
    setFetchDate(originalFetchDate);
    globalThis.fetch = originalFetch;
  }
});

test("SuperTechFans HackerNews RSS keeps only BioAI-relevant story sections", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>2026 07 08 HackerNews</title>
      <link>https://supertechfans.com/cn/post/2026-07-08-HackerNews/</link>
      <pubDate>Wed, 08 Jul 2026 07:00:12 +0800</pubDate>
      <description><![CDATA[
        <h2 id="1-router">1. OpenWrt One – 开源硬件路由器</h2>
        <p><a href="https://openwrt.org/toh/openwrt/one">https://openwrt.org/toh/openwrt/one</a></p>
        <p>OpenWrt One 是开源硬件路由器。</p>
        <hr>
        <h2 id="2-biomarker">2. AI biomarker platform predicts biological age from proteomics</h2>
        <p><a href="https://example.com/ai-biomarker">https://example.com/ai-biomarker</a></p>
        <p>A machine learning biomarker model estimates biological age and dementia risk from proteomics.</p>
      ]]></description>
    </item>
  </channel>
</rss>`,
  });
  setFetchDate("2026-07-08");

  try {
    const raw = await LongevityNewsRssDataSource.fetch({
      LONGEVITY_NEWS_RSS_URLS: "SuperTechFans HackerNews::https://www.supertechfans.com/cn/index.xml",
      LONGEVITY_NEWS_FILTER_DAYS: "3",
      LONGEVITY_NEWS_MAX_FEEDS_PER_RUN: "1",
      LONGEVITY_NEWS_MAX_ITEMS_PER_FEED: "1",
      SUPERTECHFANS_MAX_STORIES_PER_ITEM: "12",
    });
    const items = LongevityNewsRssDataSource.transform(raw, "news");

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "AI biomarker platform predicts biological age from proteomics");
    assert.equal(items[0].url, "https://example.com/ai-biomarker");
    assert.equal(items[0].source, "SuperTechFans HackerNews");
  } finally {
    setFetchDate(originalFetchDate);
    globalThis.fetch = originalFetch;
  }
});
