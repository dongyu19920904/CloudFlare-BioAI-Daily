import {
    getRandomUserAgent,
    sleep,
    isDateWithinLastDays,
    stripHtml,
    formatDateToChineseWithTime,
    escapeHtml,
} from '../helpers.js';

/**
 * 通用 Folo 多 ID 抓取源：
 * - 适合无法创建/维护列表的场景
 * - 通过 env.FOLO_NEWS_IDS（逗号/空格分隔）配置多个 feedId 或 listId
 * - env.FOLO_NEWS_ID_TYPE = "feed" | "list" | "auto"
 *   - auto：先按 feedId 抓，若无数据再按 listId 抓（默认）
 */
const FoloMultiFeedsDataSource = {
    type: 'folo-multi-feeds',

    async fetch(env, foloCookie) {
        const rawIds =
            env.FOLO_NEWS_IDS ||
            env.FOLO_FEED_IDS ||
            env.FOLO_LIST_IDS;

        if (!rawIds) {
            console.warn('FOLO_NEWS_IDS is not set. Skipping folo-multi-feeds fetch.');
            return {
                version: 'https://jsonfeed.org/version/1.1',
                title: 'Folo Multi Feeds',
                home_page_url: 'https://app.follow.is',
                description: 'Aggregated Folo feeds by multiple IDs',
                language: 'zh-cn',
                items: [],
            };
        }

        const ids = rawIds
            .split(/[,\\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const uniqueIds = [...new Set(ids)];

        const fetchPages = parseInt(env.FOLO_NEWS_FETCH_PAGES || env.FOLO_FETCH_PAGES || '2', 10);
        const filterDays = parseInt(env.FOLO_FILTER_DAYS || '3', 10);
        const idType = String(env.FOLO_NEWS_ID_TYPE || 'auto').toLowerCase(); // feed | list | auto

        const allItems = [];

        const fetchOneKind = async (id, kind) => {
            let publishedAfter = null;
            let localItems = [];
            for (let i = 0; i < fetchPages; i++) {
                const headers = {
                    'User-Agent': getRandomUserAgent(),
                    'Content-Type': 'application/json',
                    accept: 'application/json',
                    'accept-language': 'zh-CN,zh;q=0.9',
                    origin: 'https://app.follow.is',
                    priority: 'u=1, i',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-site',
                    'x-app-name': 'Folo Web',
                    'x-app-version': '0.4.9',
                };

                if (foloCookie) {
                    headers.Cookie = foloCookie;
                }

                const body = { view: 1, withContent: true };
                if (kind === 'list') body.listId = id;
                else body.feedId = id;
                if (publishedAfter) body.publishedAfter = publishedAfter;

                console.log(`Fetching Folo ${kind} ${id}, page ${i + 1}...`);
                const response = await fetch(env.FOLO_DATA_API, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    console.error(`Failed to fetch Folo ${kind} ${id}, page ${i + 1}: ${response.statusText}`);
                    break;
                }

                const data = await response.json();
                if (!data?.data?.length) break;

                const filteredItems = data.data.filter((entry) =>
                    isDateWithinLastDays(entry.entries.publishedAt, filterDays),
                );
                localItems.push(
                    ...filteredItems.map((entry) => ({
                        id: entry.entries.id,
                        url: entry.entries.url,
                        title: entry.entries.title,
                        content_html: entry.entries.content,
                        date_published: entry.entries.publishedAt,
                        authors: [{ name: entry.entries.author }],
                        source: entry.entries.author
                            ? `${entry.feeds?.title || ''} - ${entry.entries.author}`.trim()
                            : entry.feeds?.title || 'Folo',
                    })),
                );

                publishedAfter = data.data[data.data.length - 1].entries.publishedAt;
                await sleep(Math.random() * 1500);
            }
            return localItems;
        };

        for (const id of uniqueIds) {
            try {
                if (idType === 'list') {
                    allItems.push(...(await fetchOneKind(id, 'list')));
                } else if (idType === 'feed') {
                    allItems.push(...(await fetchOneKind(id, 'feed')));
                } else {
                    // auto: 先 feed 再 list
                    const feedItems = await fetchOneKind(id, 'feed');
                    if (feedItems.length > 0) {
                        allItems.push(...feedItems);
                    } else {
                        allItems.push(...(await fetchOneKind(id, 'list')));
                    }
                }
            } catch (error) {
                console.error(`Error fetching Folo id ${id}:`, error);
            }
        }

        return {
            version: 'https://jsonfeed.org/version/1.1',
            title: 'Folo Multi Feeds',
            home_page_url: 'https://app.follow.is',
            description: 'Aggregated Folo feeds by multiple IDs',
            language: 'zh-cn',
            items: allItems,
        };
    },

    transform(rawData, sourceType) {
        if (!rawData || !rawData.items) return [];
        const seen = new Set();
        return rawData.items
            .filter((item) => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            })
            .map((item) => ({
                id: item.id,
                type: sourceType,
                url: item.url,
                title: item.title,
                description: stripHtml(item.content_html || ''),
                published_date: item.date_published,
                authors: item.authors ? item.authors.map((a) => a.name).join(', ') : 'Unknown',
                source: item.source || 'Folo',
                details: {
                    content_html: item.content_html || '',
                },
            }));
    },

    generateHtml(item) {
        return `
            <strong>${escapeHtml(item.title)}</strong><br>
            <small>来源: ${escapeHtml(item.source || '未知')} | 发布时间: ${formatDateToChineseWithTime(
                item.published_date,
            )}</small>
            <div class="content-html">${item.details.content_html || '无内容'}</div>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">阅读更多</a>
        `;
    },
};

export default FoloMultiFeedsDataSource;
