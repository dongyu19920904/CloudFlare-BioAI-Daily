import { insertAd } from './ad.js';
import { insertFoot } from './foot.js';
import { addReferencedSourceMedia, getReferencedSourceUrls } from './blogMedia.js';
import { safeBioDailyImage } from './bioDailySourceMedia.js';
import { itemMatchesPapersCoolTopic } from './dataSources/longevity-rss.js';

export function isBioDailyPaperCandidate(candidate, env = {}) {
    const text = `${candidate.title || ''}\n${candidate.text || ''}`;
    const agriculture = /\b(potato|plantvillage|crop|farming|agricultur\w*|leaf disease)\b/i.test(text);
    const biomedical = /\b(human|patient|clinical|mice|mouse|mammal\w*|drug discovery|alzheimer\w*|dementia)\b/i.test(text);
    const biologicalObject = /\b(ag(?:e)?ing|longevity|senescen\w*|geroscience|healthspan|epigenetic|methylation|dementia|alzheimer\w*|parkinson\w*|brain|mri|eeg|neuroimag\w*|neuron\w*|protein\w*|ligand\w*|drug\w*|molecul\w*|genom\w*|genetic\w*|transcriptom\w*|cell\w*|tissue\w*|clinical|patient\w*|tumou?r\w*|cancer\w*|organs?|disease\w*|physiolog\w*|patholog\w*)\b/i.test(text);
    return biologicalObject && (!agriculture || biomedical) && itemMatchesPapersCoolTopic({ title: candidate.title, summary: text }, env);
}

export function getBioDailyMediaUrl(item) {
    const urls = [item?.details?.imageUrl, item?.imageUrl];
    for (const tag of String(item?.details?.content_html || '').match(/<img\b[^>]*>/gi) || []) {
        if (/\b(?:width|height)=["']?[01](?:["'\s>])/i.test(tag)) continue;
        for (const match of tag.matchAll(/\s(?:data-src|src)=["']([^"']+)["']/gi)) urls.push(match[1]);
    }
    return urls.map(safeBioDailyImage).find(Boolean) || '';
}

export function restoreBioDailySourceMedia(markdown, candidates) {
    const label = value => String(value || '来源配图').replace(/[\[\]\n]/g, ' ').trim();
    const available = candidates.filter(item => item.url && safeBioDailyImage(item.mediaUrl));
    const faq = markdown.search(/^##\s*\*{0,2}(?:❓\s*)?相关问题/m);
    const body = faq < 0 ? markdown : markdown.slice(0, faq);
    const tail = faq < 0 ? '' : markdown.slice(faq);
    let count = (body.match(/!\[/g) || []).length;
    const seen = new Set([...body.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)/g)].map(match => match[1]));
    return body.split(/(?=^###\s)/m).map(block => {
        if (count >= 4) return block;
        const urls = new Set(getReferencedSourceUrls(block));
        const image = available.find(item => urls.has(item.url) && !seen.has(item.mediaUrl));
        if (!image) return block;
        const context = `### ${label(image.title)}\n\n[${label(image.title)}](${image.url})\n\n![${label(image.title)}](${image.mediaUrl})`;
        const repaired = addReferencedSourceMedia(block, context);
        const images = [...repaired.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)/g)];
        if (!images.length || images.some(match => seen.has(match[1]))) return block;
        for (const match of images) seen.add(match[1]);
        count += images.length;
        return repaired;
    }).join('') + tail;
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
            const sources = getReferencedSourceUrls(item);
            const prose = item.replace(/^###[^\n]*\n/, '').trim();
            if (!sources.length && /^(?:\*|（|\()?\s*(?:见下方|已在[^\n]{0,40}(?:详述|报道)|已预留)/.test(prose)) {
                return false;
            }
            if (!sources.length) return true;
            const keys = sources.map(source => {
                const parsed = new URL(source);
                parsed.hash = '';
                for (const key of [...parsed.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) parsed.searchParams.delete(key);
                return parsed.href.replace(/\/$/, '');
            });
            if (keys.some(key => seen.has(key))) return false;
            for (const key of keys) seen.add(key);
            return true;
        });
        if (/TOP\s+\d+/i.test(heading) && kept.length) {
            return heading.replace(/TOP\s+\d+/i, `TOP ${kept.length}`) + kept.map((item, index) => item.replace(/^###\s+\d+\.\s*/, `### ${index + 1}. `)).join('');
        }
        if (kept.length === items.length) return heading + kept.map(item => item.replace(/^###\s+\d+\.\s*/, '### ')).join('');
        if (!kept.length) return '';
        return heading + kept.map(item => item.replace(/^###\s+\d+\.\s*/, '### ')).join('');
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

export function assertBioDailyBodySources(markdown, sourceItems = []) {
    const allowed = new Set();
    for (const text of sourceItems) {
        for (const match of String(text).matchAll(/https?:\/\/[^\s<>"']+/g)) {
            const token = match[0].replace(/[)\]，。；]+$/g, '');
            // Prose may end a URL with punctuation; retain the exact URL too.
            for (const value of [token, token.replace(/[.,;:]+$/g, '')]) {
                try { allowed.add(new URL(value).href); } catch { /* Ignore malformed input URLs. */ }
            }
        }
    }
    const content = String(markdown || '');
    if (!/^##\s*\*{0,2}(?:🔥\s*)?今日焦点\s*TOP\s+\d+/m.test(content)) {
        throw new Error('Daily body must contain a complete TOP section');
    }
    const items = content.split(/(?=^###\s)/m).slice(1);
    if (!items.length) throw new Error('Daily body must contain sourced news items');
    for (const [index, item] of items.entries()) {
        const urls = getReferencedSourceUrls(item);
        if (!urls.length || urls.some(url => !allowed.has(url))) {
            const error = new Error('Daily body omitted a source or invented a source URL');
            error.dailySourceDiagnostics = { item: index + 1, reason: urls.length ? 'unknown_source' : 'missing_source' };
            throw error;
        }
    }
}

export function parseBioDailySummary(markdown) {
    const text = String(markdown || '').trim().replace(/^```(?:text|markdown)?\s*\n([\s\S]*?)\n```$/i, '$1');
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length !== 3 || lines.some(line => /^#|^[-*]\s|^\d+[.)]\s|https?:\/\/|```/.test(line))) {
        throw new Error('Daily summary must contain exactly three plain-text lines');
    }
    return lines.join('\n');
}

export function getBioDailyReadabilityDiagnostics(markdown) {
    const body = String(markdown).split(/^##\s*\*{0,2}(?:❓\s*)?相关问题/m)[0];
    const lengths = body.split(/(?=^###\s)/m).filter(block => /^###\s/.test(block)).map(block => {
        const prose = block.replace(/^###[^\n]*\n/, '').replace(/^##[^\n]*$/gm, '')
            .replace(/\[!\[[^\]]*\]\([^\n]*?\)\]\([^\n]*?\)/g, '')
            .replace(/!\[[^\]]*\]\([^\n]*?\)/g, '')
            .replace(/\[([^\]]+)\]\([^\n]*?\)/g, '$1').replace(/<[^>]*>/g, '');
        return (prose.match(/\p{Script=Han}/gu) || []).length;
    });
    return { items: lengths.length, meanHan: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0,
        overlong: lengths.flatMap((han, index) => han > 220 ? [{ item: index + 1, han }] : []) };
}

export function prepareBioDailyPlainEditingInput(markdown, sourceItems = []) {
    const references = {};
    const byUrl = new Map();
    let prompt = String(markdown || '').replace(/(\]\()(https?:\/\/[^\s)]+)(?=[\s)])/g, (_match, prefix, url) => {
        if (!byUrl.has(url)) {
            const id = `BIOAI_REF_${byUrl.size + 1}`;
            byUrl.set(url, id);
            references[id] = url;
        }
        return prefix + byUrl.get(url);
    });
    // Verify against the selected source, not another paraphrase of the draft.
    const evidence = sourceItems.filter(text => typeof text === 'string' && [...byUrl.keys()].some(url => text.includes(url)))
        .map(text => {
            let protectedText = text;
            for (const [url, id] of byUrl) protectedText = protectedText.replaceAll(url, id);
            return protectedText;
        });
    if (evidence.length) prompt += '\n\n【原始来源事实核查材料：仅核查已有条目，不新增新闻，不作为输出栏目】\n' + evidence.join('\n\n');
    return { prompt, references };
}

export function parseBioDailyPlainEditingResult(markdown, originalDraft, references = {}) {
    const restored = String(markdown || '').replace(/BIOAI_REF_\d+\b/g, id => {
        if (!Object.hasOwn(references, id)) throw new Error('Daily plain editing invented a source reference');
        return references[id];
    });
    const content = restored.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*)\n```$/i, '$1').trim();
    const top = /^##\s*\*{0,2}(?:🔥\s*)?今日焦点\s*TOP\s+\d+.*$/im.exec(content);
    const summary = content.slice(0, top?.index ?? 0).match(/```(?:text|markdown)?\s*\n([\s\S]*?)\n```/i)?.[1]?.trim();
    if (!top || !summary || summary.split(/\r?\n/).filter(line => line.trim()).length !== 3) {
        throw new Error('Daily plain editing must return a complete body and three summary lines');
    }
    const body = content.slice(top.index);
    const expectedSources = new Set(getReferencedSourceUrls(originalDraft));
    const actualSources = new Set(getReferencedSourceUrls(body));
    if ([...actualSources].some(url => !expectedSources.has(url)) || [...expectedSources].some(url => !actualSources.has(url))) {
        throw new Error('Daily plain editing changed or omitted a source URL');
    }
    return { body, summary };
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
