import test from "node:test";
import assert from "node:assert/strict";

import {
  LongevityNewsRssDataSource,
  PapersCoolDataSource,
} from "../src/dataSources/longevity-rss.js";
import { getISODate, setFetchDate } from "../src/helpers.js";

const originalFetch = globalThis.fetch;
const originalFetchDate = getISODate();

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
