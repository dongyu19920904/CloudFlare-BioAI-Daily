import { insertAd } from './ad.js';
import { insertFoot } from './foot.js';
import { addReferencedSourceMedia, getReferencedSourceUrls } from './blogMedia.js';
import { itemMatchesPapersCoolTopic } from './dataSources/longevity-rss.js';

export function isBioDailyPaperCandidate(candidate, env = {}) {
    const text = `${candidate.title || ''}\n${candidate.text || ''}`;
    const agriculture = /\b(potato|plantvillage|crop|farming|agricultur\w*|leaf disease)\b/i.test(text);
    const biomedical = /\b(human|patient|clinical|mice|mouse|mammal\w*|drug discovery|alzheimer\w*|dementia)\b/i.test(text);
    return (!agriculture || biomedical) && itemMatchesPapersCoolTopic({ title: candidate.title, summary: text }, env);
}

export function getBioDailyMediaUrl(item) {
    return item?.details?.imageUrl || item?.imageUrl ||
        String(item?.details?.content_html || '').match(/<img\b[^>]*\ssrc=["']([^"']+)["']/i)?.[1] || '';
}

export function restoreBioDailySourceMedia(markdown, candidates) {
    const label = value => String(value || '来源配图').replace(/[\[\]\n]/g, ' ').trim();
    const context = candidates.filter(item => item.url && item.mediaUrl).map(item =>
        `### ${label(item.title)}\n\n[${label(item.title)}](${item.url})\n\n![${label(item.title)}](${item.mediaUrl})`
    ).join('\n\n');
    const faq = markdown.search(/^##\s*\*{0,2}(?:❓\s*)?相关问题/m);
    const body = faq < 0 ? markdown : markdown.slice(0, faq);
    const tail = faq < 0 ? '' : markdown.slice(faq);
    return body.split(/(?=^###\s)/m).map(block => addReferencedSourceMedia(block, context)).join('') + tail;
}

export async function readBioDailyPreviewCache(kv, date, categories) {
    return Object.fromEntries(await Promise.all(categories.map(async category => {
        const value = await kv.get(`${date}-${category}`, 'json');
        return [category, Array.isArray(value) ? value : []];
    })));
}

export function deduplicateBioDailyNews(markdown) {
    const seen = new Set();
    const sections = String(markdown).split(/(?=^##\s)/m).map(section => {
        if (/^##.*相关问题/.test(section)) {
            const [heading, ...questions] = section.split(/(?=^###\s)/m);
            const kept = questions.filter(question => !/监管|合规|法律|合法|法规|\bBLA\b|第\s*361\s*条/.test(question));
            if (kept.length === questions.length) return section;
            return kept.length ? heading + kept.join('') : '';
        }
        const [heading, ...items] = section.split(/(?=^###\s)/m);
        if (!items.length) return section;
        const kept = items.filter(item => {
            const source = getReferencedSourceUrls(item)[0];
            const prose = item.replace(/^###[^\n]*\n/, '').trim();
            if (!source && /^(?:\*|（|\()?\s*(?:见下方|已在[^\n]{0,40}(?:详述|报道)|已预留)/.test(prose)) {
                return false;
            }
            if (!source) return true;
            const parsed = new URL(source);
            parsed.hash = '';
            for (const key of [...parsed.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) parsed.searchParams.delete(key);
            const key = parsed.href.replace(/\/$/, '');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        if (/TOP\s+\d+/i.test(heading) && kept.length) {
            return heading.replace(/TOP\s+\d+/i, `TOP ${kept.length}`) + kept.map((item, index) => item.replace(/^###\s+\d+\.\s*/, `### ${index + 1}. `)).join('');
        }
        if (kept.length === items.length) return section;
        if (!kept.length) return '';
        return heading + kept.join('');
    });
    return sections.filter(Boolean).join('');
}

export function assembleBioDailyMarkdown(markdown, summary, env = {}) {
    const content = String(markdown || '').trim();
    const top = /^##\s*\*{0,2}(?:🔥\s*)?(?:今日焦点|重磅)\s*TOP\s+\d+.*$/im.exec(content);
    const body = deduplicateBioDailyNews(top ? content.slice(top.index) : content);
    const lines = String(summary || '').replace(/^```(?:text|markdown)?\s*/i, '').replace(/\s*```$/i, '')
        .split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim()).filter(Boolean);
    const candidates = lines.length > 1 ? lines : (lines[0]?.match(/[^。！？!?]+[。！？!?]?/g) || []);
    let result = `## **今日摘要**\n\n\`\`\`\n${candidates.slice(0, 3).join('\n')}\n\`\`\`\n\n${body}`;
    if (env.INSERT_AD === 'true') result += `\n${insertAd()}\n`;
    if (env.INSERT_FOOT === 'true') result += `\n${insertFoot()}\n`;
    return result;
}

export function buildBioDailyCandidateBudget(candidates) {
    const count = type => candidates.filter(item => item.sourceType === type).length;
    const projects = count('project');
    const social = count('socialMedia');
    return [
        '【栏目候选预算】',
        `当前候选 ${candidates.length} 条。项目 ${projects} 条，真实社媒 ${social} 条。`,
        `先为开源 TOP 预留 ${Math.min(projects, 2)} 条，为社媒精选预留 ${Math.min(social, 2)} 条；其余再按事实分到 TOP、产品、研究和行业。`,
        '预留素材不得重复进入 TOP；没有对应素材的栏目省略，不用预测或重复新闻补位。',
    ].join('\n');
}
