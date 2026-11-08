import { escapeHtml, formatDateToChineseWithTime, isDateWithinLastDays, stripHtml } from '../helpers.js';
import { assessBioPaper, getArxivIdentity, selectBioPapers } from '../bioPaperSelection.js';

const DEFAULT_PAPERS_COOL_FEEDS = [
    'Papers.cool q-bio::https://papers.cool/arxiv/q-bio/feed',
    'Papers.cool cs.LG::https://papers.cool/arxiv/cs.LG/feed',
    'Papers.cool cs.AI::https://papers.cool/arxiv/cs.AI/feed',
    'Papers.cool cs.CV::https://papers.cool/arxiv/cs.CV/feed',
    'Papers.cool stat.ML::https://papers.cool/arxiv/stat.ML/feed',
    'Papers.cool physics.med-ph::https://papers.cool/arxiv/physics.med-ph/feed',
].join('|');

const DEFAULT_PAPERS_COOL_AI_KEYWORDS = [
    'ai',
    'artificial intelligence',
    'machine learning',
    'deep learning',
    'foundation model',
    'transformer',
    'neural network',
    'self-supervised',
    'multimodal',
    'large language model',
    'llm',
    'diffusion',
];

const DEFAULT_PAPERS_COOL_BIO_KEYWORDS = [
    'aging',
    'ageing',
    'longevity',
    'biological age',
    'epigenetic clock',
    'methylation clock',
    'brain age',
    'dementia',
    'alzheimer',
    'senescence',
    'senolytic',
    'geroscience',
    'healthspan',
    'biomarker',
    'protein',
    'drug discovery',
    'molecular',
    'genomic',
    'genomics',
    'transcriptomic',
    'transcriptomics',
    'single-cell',
    'spatial transcriptomics',
    'cell segmentation',
    'omics',
    'brain',
    'neuron',
    'cognition',
    'disease',
];

const DEFAULT_PAPERS_COOL_STRONG_KEYWORDS = [
    'biological age',
    'epigenetic clock',
    'methylation clock',
    'proteomics clock',
    'brain age',
    'retinal age',
    'facial age',
    'senolytic',
    'geroscience',
    'healthspan',
    'alzheimer',
    'dementia',
    'aging clock',
    'single-cell',
    'spatial transcriptomics',
    'protein design',
    'drug discovery',
];

function parsePositiveInteger(value, defaultValue) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function decodeXmlEntities(value) {
    if (!value) return '';
    return String(value)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number.parseInt(num, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#039;/g, "'");
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTag(block, tagNames) {
    for (const tagName of tagNames) {
        const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, 'i');
        const match = String(block || '').match(pattern);
        if (match) return decodeXmlEntities(match[1].trim());
    }
    return '';
}

function extractAllTags(block, tagNames) {
    const values = [];
    for (const tagName of tagNames) {
        const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, 'gi');
        let match;
        while ((match = pattern.exec(String(block || ''))) !== null) {
            values.push(decodeXmlEntities(match[1].trim()));
        }
    }
    return values;
}

function extractAttr(block, tagName, attrName) {
    const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*\\s${escapeRegExp(attrName)}=["']([^"']+)["'][^>]*>`, 'i');
    const match = String(block || '').match(pattern);
    return match ? decodeXmlEntities(match[1].trim()) : '';
}

function extractImageUrl(html) {
    const input = String(html || '');
    const mediaMatch = input.match(/<media:content\b[^>]*\surl=["']([^"']+)["'][^>]*>/i);
    if (mediaMatch) return decodeXmlEntities(mediaMatch[1]);
    const enclosureMatch = input.match(/<enclosure\b[^>]*\surl=["']([^"']+)["'][^>]*>/i);
    if (enclosureMatch) return decodeXmlEntities(enclosureMatch[1]);
    const imageMatch = input.match(/<img\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/i);
    return imageMatch ? decodeXmlEntities(imageMatch[1]) : '';
}

function extractFirstLink(html) {
    const match = String(html || '').match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i);
    return match ? decodeXmlEntities(match[1]) : '';
}

function splitList(value) {
    return String(value || '')
        .split(/[|,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseKeywordList(value, fallback) {
    const custom = splitList(value);
    return custom.length > 0 ? custom.map((item) => item.toLowerCase()) : fallback;
}

function containsKeyword(text, keyword) {
    const normalizedKeyword = String(keyword || '').trim().toLowerCase();
    if (!normalizedKeyword) return false;
    if (/^[a-z0-9]+$/i.test(normalizedKeyword)) {
        const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}([^a-z0-9]|$)`, 'i');
        return pattern.test(text);
    }
    return text.includes(normalizedKeyword);
}

function parseFeedDefinitions(rawValue, fallbackValue) {
    const raw = String(rawValue || fallbackValue || '').trim();
    if (!raw) return [];
    return raw
        .split(/\s*\|\s*|\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const separatorIndex = entry.indexOf('::');
            if (separatorIndex >= 0) {
                return {
                    name: entry.slice(0, separatorIndex).trim() || 'RSS',
                    url: entry.slice(separatorIndex + 2).trim(),
                };
            }
            return { name: 'RSS', url: entry };
        })
        .filter((feed) => /^https?:\/\//i.test(feed.url));
}

export function itemMatchesPapersCoolTopic(item, env) {
    const text = `${item.title || ''}\n${item.summary || ''}`.toLowerCase();
    const aiKeywords = parseKeywordList(env.PAPERS_COOL_AI_KEYWORDS, DEFAULT_PAPERS_COOL_AI_KEYWORDS);
    const bioKeywords = parseKeywordList(env.PAPERS_COOL_BIO_KEYWORDS, DEFAULT_PAPERS_COOL_BIO_KEYWORDS);
    const strongKeywords = parseKeywordList(env.PAPERS_COOL_STRONG_KEYWORDS, DEFAULT_PAPERS_COOL_STRONG_KEYWORDS);

    const hasAi = aiKeywords.some((keyword) => containsKeyword(text, keyword));
    const hasBio = bioKeywords.some((keyword) => containsKeyword(text, keyword));
    const hasStrong = strongKeywords.some((keyword) => containsKeyword(text, keyword));
    return (hasAi && hasBio) || hasStrong;
}

function splitSuperTechFansItem(item, feedName, feedUrl, env) {
    if (!/supertechfans\.com\/cn\/post\/\d{4}-\d{2}-\d{2}-HackerNews/i.test(item.url || '')) {
        return [];
    }

    const sectionPattern = /<h2\b[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<hr>|<h2\b|$)/gi;
    const maxStories = parsePositiveInteger(env.SUPERTECHFANS_MAX_STORIES_PER_ITEM, 12);
    const items = [];
    let match;

    while ((match = sectionPattern.exec(item.summary || '')) !== null && items.length < maxStories) {
        const anchor = decodeXmlEntities(match[1]);
        const rawHeading = stripHtml(decodeXmlEntities(match[2]))
            .replace(/\s*#\s*$/, '')
            .trim();
        if (!/^\d+\.\s+/.test(rawHeading)) continue;
        const heading = rawHeading.replace(/^\d+\.\s*/, '').trim();
        const sectionHtml = decodeXmlEntities(match[3]);
        const summary = stripHtml(sectionHtml).slice(0, 1500);
        const url = extractFirstLink(sectionHtml) || item.url;
        const splitItem = {
            id: `${item.url}#${anchor}`,
            url,
            title: heading,
            summary,
            date_published: item.date_published,
            authors: item.authors,
            source: feedName,
            feedUrl,
            imageUrl: extractImageUrl(sectionHtml),
        };

        if (heading && summary && itemMatchesPapersCoolTopic(splitItem, env)) {
            items.push(splitItem);
        }
    }

    return items;
}

function parseFeedItems(xml, feedName, feedUrl, sourceKind, env, diagnostics = null) {
    const input = String(xml || '');
    const isAtom = /<feed\b/i.test(input);
    const entryPattern = isAtom
        ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi
        : /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    const items = [];
    let match;

    while ((match = entryPattern.exec(input)) !== null) {
        if (diagnostics) diagnostics.fetched += 1;
        const block = match[1];
        const title = extractTag(block, ['title']);
        const summary = extractTag(block, ['summary', 'content', 'content:encoded', 'description']);
        const link = isAtom
            ? (extractAttr(block, 'link', 'href') || extractTag(block, ['id']))
            : (extractTag(block, ['link']) || extractTag(block, ['guid']));
        const originalDate = extractTag(block, ['published', 'pubDate', 'dc:date']);
        const updatedAt = extractTag(block, ['updated']);
        const publishedAt = originalDate || updatedAt || (sourceKind === 'papers-cool' ? '' : new Date().toISOString());
        const authors = isAtom
            ? extractAllTags(block, ['name'])
            : extractAllTags(block, ['dc:creator', 'author']);
        const imageUrl = extractImageUrl(block) || extractImageUrl(summary);

        if (!title || !link) {
            if (diagnostics) diagnostics.invalid += 1;
            continue;
        }

        const item = {
            id: link,
            url: link,
            title,
            summary,
            date_published: publishedAt,
            updatedAt,
            dateBasis: originalDate ? 'published' : updatedAt ? 'updated_only' : 'missing',
            authors,
            source: feedName,
            feedUrl,
            imageUrl,
        };

        const superTechFansItems = splitSuperTechFansItem(item, feedName, feedUrl, env);
        if (superTechFansItems.length > 0) {
            items.push(...superTechFansItems);
            continue;
        }
        if (/supertechfans\.com\/cn\/post\/\d{4}-\d{2}-\d{2}-HackerNews/i.test(link)) {
            continue;
        }

        if (sourceKind === 'papers-cool') {
            const assessment = assessBioPaper(item);
            const customKeywords = ['PAPERS_COOL_AI_KEYWORDS', 'PAPERS_COOL_BIO_KEYWORDS', 'PAPERS_COOL_STRONG_KEYWORDS'].some(key => String(env[key] || '').trim());
            const reason = !assessment.priority ? assessment.reason : customKeywords && !itemMatchesPapersCoolTopic(item, env) ? 'configured_keyword_filter' : '';
            if (reason) {
                diagnostics.topicRejected += 1;
                diagnostics.topicReasons[reason] = (diagnostics.topicReasons[reason] || 0) + 1;
                continue;
            }
        }
        items.push(item);
    }

    return items;
}

async function fetchText(url, env, maxBytes = 0) {
    const timeoutMs = parsePositiveInteger(env.DATA_SOURCE_FETCH_TIMEOUT_MS, 20000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'BioAI-Daily-Worker/1.0',
                Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, */*',
            },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        if (!maxBytes || !response.body?.getReader) {
            const text = await response.text();
            if (maxBytes && new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('Paper feed exceeds byte limit');
            return text;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let size = 0;
        let text = '';
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) return text + decoder.decode();
                size += value.byteLength;
                if (size > maxBytes) {
                    await reader.cancel();
                    throw new Error('Paper feed exceeds byte limit');
                }
                text += decoder.decode(value, { stream: true });
            }
        } finally {
            reader.releaseLock();
        }
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildContentHtml(item) {
    const summary = item.summary || '';
    const imageHtml = item.imageUrl ? `<p><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}"></p>` : '';
    const arxivMatch = String(item.url || '').match(/papers\.cool\/arxiv\/(\d{4}\.\d+)/i);
    const pdfLink = arxivMatch
        ? `<p><a href="https://arxiv.org/pdf/${arxivMatch[1]}" target="_blank" rel="noopener noreferrer">PDF</a></p>`
        : '';
    return `${imageHtml}<p>${summary}</p>${pdfLink}`;
}

function createRssDataSource(options) {
    const {
        type,
        envKey,
        fallbackFeeds = '',
        filterDaysKey,
        maxFeedsKey,
        maxItemsPerFeedKey,
        defaultFilterDays = 7,
        defaultMaxFeeds = 8,
        defaultMaxItemsPerFeed = 8,
        sourceKind = 'rss',
    } = options;

    return {
        type,

        async fetch(env) {
            const feeds = parseFeedDefinitions(env[envKey], fallbackFeeds);
            const maxFeeds = parsePositiveInteger(env[maxFeedsKey], defaultMaxFeeds);
            const maxItemsPerFeed = parsePositiveInteger(env[maxItemsPerFeedKey], defaultMaxItemsPerFeed);
            const filterDays = parsePositiveInteger(env[filterDaysKey], defaultFilterDays);
            const selectedFeeds = feeds.slice(0, maxFeeds);
            const allItems = [];
            const seen = new Set();
            const diagnostics = sourceKind === 'papers-cool'
                ? { configuredFeeds: feeds.length, requestedFeeds: selectedFeeds.length, feeds: [] }
                : null;

            if (selectedFeeds.length === 0) {
                console.warn(`${envKey} is not set. Skipping ${type} fetch.`);
                return { items: [] };
            }

            const feedResults = await Promise.all(selectedFeeds.map(async (feed) => {
                const stats = diagnostics ? { feed: feed.name, status: 'ok', fetched: 0, invalid: 0, topicRejected: 0, topicReasons: {}, dateRejected: 0, updatedOnly: 0, duplicates: 0, capped: 0, selected: 0 } : null;
                try {
                    const xml = await fetchText(feed.url, env, stats ? 2 * 1024 * 1024 : 0);
                    if (stats && !/<(?:feed|rss)\b/i.test(xml)) throw new Error('Expected RSS or Atom feed');
                    const parsed = parseFeedItems(xml, feed.name, feed.url, sourceKind, env, stats);
                    const recent = parsed.filter((item) => isDateWithinLastDays(item.date_published, filterDays));
                    const ranked = stats ? selectBioPapers(recent) : recent;
                    const parsedItems = ranked.slice(0, maxItemsPerFeed);
                    if (stats) {
                        stats.dateRejected = parsed.length - recent.length;
                        stats.updatedOnly = recent.filter(item => item.dateBasis === 'updated_only').length;
                        stats.duplicates = recent.length - ranked.length;
                        stats.capped = ranked.length - parsedItems.length;
                        stats.selected = parsedItems.length;
                    }

                    console.log(`[${type}] ${feed.name}: ${parsedItems.length} recent items.`);
                    return { items: parsedItems, stats };
                } catch (error) {
                    console.warn(`[${type}] Failed to fetch ${feed.url}: ${error.message}`);
                    if (stats) stats.status = 'error';
                    return { items: [], stats };
                }
            }));

            for (const { items: parsedItems, stats } of feedResults) {
                for (const item of parsedItems) {
                    const key = (diagnostics && getArxivIdentity(item)) || item.url || item.id || item.title;
                    if (!key || seen.has(key)) {
                        if (stats) { stats.duplicates += 1; stats.selected -= 1; }
                        continue;
                    }
                    seen.add(key);
                    allItems.push(item);
                }
                if (diagnostics) {
                    diagnostics.feeds.push(stats);
                    console.log(`[papers-cool][funnel] ${JSON.stringify(stats)}`);
                }
            }

            return diagnostics ? { items: selectBioPapers(allItems), diagnostics } : { items: allItems };
        },

        transform(rawData, sourceType) {
            if (!rawData || !Array.isArray(rawData.items)) return [];
            return rawData.items.map((item) => ({
                id: item.id,
                type: sourceType,
                url: item.url,
                title: item.title,
                description: stripHtml(item.summary || ''),
                published_date: item.date_published,
                authors: Array.isArray(item.authors) ? item.authors.join(', ') : (item.authors || 'Unknown'),
                source: item.source || type,
                details: {
                    content_html: buildContentHtml(item),
                    feedUrl: item.feedUrl,
                    imageUrl: item.imageUrl || '',
                    ...(sourceKind === 'papers-cool' ? { updatedAt: item.updatedAt, dateBasis: item.dateBasis } : {}),
                },
            }));
        },

        generateHtml(item) {
            const dateLabel = sourceKind === 'papers-cool' && item.details?.dateBasis === 'updated_only'
                ? '来源更新时间（原始发表日期未知）' : '发布时间';
            return `
                <strong>${escapeHtml(item.title)}</strong><br>
                <small>来源: ${escapeHtml(item.source || type)} | ${dateLabel}: ${formatDateToChineseWithTime(item.published_date)}</small>
                <div class="content-html">${item.details.content_html || ''}</div>
                <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">阅读更多</a>
            `;
        },
    };
}

export const LongevityNewsRssDataSource = createRssDataSource({
    type: 'longevity-news-rss',
    envKey: 'LONGEVITY_NEWS_RSS_URLS',
    filterDaysKey: 'LONGEVITY_NEWS_FILTER_DAYS',
    maxFeedsKey: 'LONGEVITY_NEWS_MAX_FEEDS_PER_RUN',
    maxItemsPerFeedKey: 'LONGEVITY_NEWS_MAX_ITEMS_PER_FEED',
    defaultFilterDays: 21,
    defaultMaxFeeds: 12,
    defaultMaxItemsPerFeed: 8,
});

export const LongevitySocialRssDataSource = createRssDataSource({
    type: 'longevity-social-rss',
    envKey: 'LONGEVITY_SOCIAL_RSS_URLS',
    filterDaysKey: 'LONGEVITY_SOCIAL_FILTER_DAYS',
    maxFeedsKey: 'LONGEVITY_SOCIAL_MAX_FEEDS_PER_RUN',
    maxItemsPerFeedKey: 'LONGEVITY_SOCIAL_MAX_ITEMS_PER_FEED',
    defaultFilterDays: 30,
    defaultMaxFeeds: 6,
    defaultMaxItemsPerFeed: 8,
});

export const PapersCoolDataSource = createRssDataSource({
    type: 'papers-cool',
    envKey: 'PAPERS_COOL_RSS_URLS',
    fallbackFeeds: DEFAULT_PAPERS_COOL_FEEDS,
    filterDaysKey: 'PAPERS_COOL_FILTER_DAYS',
    maxFeedsKey: 'PAPERS_COOL_MAX_FEEDS_PER_RUN',
    maxItemsPerFeedKey: 'PAPERS_COOL_MAX_ITEMS_PER_FEED',
    defaultFilterDays: 7,
    defaultMaxFeeds: 2,
    defaultMaxItemsPerFeed: 12,
    sourceKind: 'papers-cool',
});

export default LongevityNewsRssDataSource;
