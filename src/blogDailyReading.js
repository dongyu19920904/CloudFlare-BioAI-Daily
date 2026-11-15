import { extractMarkdownImages, extractMarkdownLinks, extractUrls } from './blogQuality.js';
import { canonicalBlogSource } from './blogHistory.js';
import { resolveBlogSource } from './blogSources.js';
import { protectBlogMarkdownLiterals } from './blogMarkdown.js';

const canonicalReadingSource = url => canonicalBlogSource(resolveBlogSource(url)?.url || url);

function sourcesIn(block) {
    const images = new Set(extractMarkdownImages(block).map(image => image.url));
    const links = extractMarkdownLinks(block).map(link => link.url);
    return [...new Set((links.length ? links : extractUrls(block)).filter(url =>
        !images.has(url) && !/\.(?:png|jpe?g|gif|webp|svg|mp4)(?:\?|$)/i.test(url)
    ).map(canonicalReadingSource).filter(Boolean))];
}

export function buildDailyReadingBrief(material, recentPosts = []) {
    const text = String(material || '');
    const used = new Set(recentPosts.flatMap(post => post.sources || []).map(canonicalReadingSource));
    const items = [];
    let section = '', title = '', lines = [], fence = null;
    const flush = () => {
        const block = lines.join('\n').trim();
        const sourceUrls = sourcesIn(block);
        if (!sourceUrls.length || block.length < 60) return;
        const existing = items.find(item => item.sources.some(url => sourceUrls.includes(url)));
        if (existing) {
            existing.sources = [...new Set([...existing.sources, ...sourceUrls])];
            existing.sections = [...new Set([...existing.sections, section])];
            return;
        }
        items.push({ id: `D${items.length + 1}`, title: title || section || '原始材料', sections: [section || '正文'], sources: sourceUrls });
    };
    for (const line of text.split(/\r?\n/)) {
        const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})/);
        if (delimiter && (!fence || delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length)) {
            fence = fence ? null : delimiter[1];
            continue;
        }
        if (fence) continue;
        const heading = !fence && line.match(/^ {0,3}(#{2,3})\s+(.+?)\s*#*$/);
        if (heading) {
            flush();
            lines = [];
            const label = heading[2].replace(/[*_]/g, '').replace(/^\d+[.、]\s*/, '');
            if (heading[1].length === 2) { section = label; title = ''; }
            else title = label;
        } else lines.push(line);
    }
    flush();
    for (const item of items) item.recentlyCovered = item.sources.some(url => used.has(url));
    return { mode: 'whole-daily', completeInputCharacters: text.length, items, minimumStories: Math.min(3, items.length), note: '清单仅用于通读、去重与选材；完整正文另附。列出链接不代表已读取原文或验证结论。近期用过的材料可作背景，有实质更新才再作重点。' };
}

export function assessDailySynthesis(body, reading) {
    // Count citations in substantive prose, never the reference list or image-only links.
    const prose = protectBlogMarkdownLiterals(body).text.split(/^##\s+(?:参考资料|references)\s*$/im)[0];
    const cited = new Set();
    for (const paragraph of prose.split(/\n\s*\n/)) {
        const text = paragraph.replace(/!\[[^\]]*]\([^\s)]+\)/g, '')
            .replace(/\[([^\]]*)]\([^\s)]+\)/g, '$1').replace(/https?:\/\/\S+/g, '');
        if ((text.match(/\p{Script=Han}/gu) || []).length < 40) continue;
        // Split nearby evidence between citations: a long paragraph plus a link bundle is not three discussions.
        const anchors = extractMarkdownLinks(paragraph).map(link => ({ url: canonicalReadingSource(link.url), index: paragraph.indexOf(link.url) }));
        for (let i = 0; i < anchors.length; i++) {
            const start = i ? Math.floor((anchors[i - 1].index + anchors[i].index) / 2) : 0;
            const end = i + 1 < anchors.length ? Math.floor((anchors[i].index + anchors[i + 1].index) / 2) : paragraph.length;
            const nearby = paragraph.slice(start, end).replace(/!?\[[^\]]*]\([^\s)]+\)/g, '').replace(/https?:\/\/\S+/g, '');
            if ((nearby.match(/\p{Script=Han}/gu) || []).length >= 40) cited.add(anchors[i].url);
        }
    }
    const usedItems = reading.items.filter(item => item.sources.some(url => cited.has(url))).map(item => item.id);
    const minimum = reading.minimumStories;
    return { usedItems, minimumStories: minimum, severe: minimum >= 2 && usedItems.length < minimum ? ['insufficient_daily_synthesis'] : [] };
}
