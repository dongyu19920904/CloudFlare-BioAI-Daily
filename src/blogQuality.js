const AI_SIGNAL_PATTERNS = [
    /ChatGPT|GPT|OpenAI|Codex|Cursor|Claude|Gemini|Grok|Perplexity|MiniMax/i,
    /agent|coding|IDE|API|模型|中转|镜像|账号|发卡|额度|客服|售后|教程|自动化|一人公司/i,
];

const BIO_SIGNAL_PATTERNS = [
    /aging|longevity|senescence|biomarker|wearable|drug discovery|protein|clinical|epigenetic/i,
    /长寿|延寿|衰老|抗衰|生命|健康|医疗|药物|蛋白|论文|临床|生物标志物|可穿戴|检测|阿尔茨海默|脑龄/i,
];

const PERSONAL_MATERIAL_PATTERNS = [
    /我|自己|小店|账号店|爱窝啦|Aivora|aivora/i,
    /账号|发卡|卡密|客服|售后|补货|上新|教程|用户|客户|供应商|中转|镜像|额度|Cursor|Claude|Gemini|Codex|ChatGPT/i,
    /一人公司|自动化|生命延续|生命科学|长生|BioAI|日报|现金流|项目/i,
];

const FABRICATED_TODAY_EXPERIENCE_PATTERNS = [
    /今天[^。！？\n]{0,50}(客户|买家|用户|供应商|客服|售后|补货|退款|订单|下单|私信|微信|群里|咖啡馆|大理)/,
    /(刚刚|早上|下午|晚上)[^。！？\n]{0,50}(客户|买家|用户|供应商|客服|售后|补货|退款|订单|下单|私信|微信|群里)/,
];

const ALWAYS_ALLOWED_ORIGINS = [
    'https://www.aivora.cn',
    'https://aivora.cn',
    'https://yuyu.aivora.cn',
    'https://news.aivora.cn',
    'https://news.aibioo.cn',
    'https://github.com',
];

function cleanUrl(url) {
    return String(url || '')
        .trim()
        .replace(/[),，。！？；;]+$/g, '');
}

function normalizeUrl(url) {
    const cleaned = cleanUrl(url);
    try {
        const parsed = new URL(cleaned);
        parsed.hash = '';
        return parsed.href.replace(/\/$/g, '');
    } catch {
        return cleaned.replace(/\/$/g, '');
    }
}

function stripMarkdown(markdown) {
    return String(markdown || '')
        .replace(/!\[[^\]]*]\([^)]+\)/g, '')
        .replace(/\[[^\]]+]\(([^)]+)\)/g, '')
        .replace(/[`*_>#-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function extractUrls(markdown) {
    const urls = new Set();
    const urlPattern = /https?:\/\/[^\s)<>"']+/gi;
    for (const match of String(markdown || '').matchAll(urlPattern)) {
        urls.add(cleanUrl(match[0]));
    }
    return [...urls];
}

export function extractMarkdownLinks(markdown) {
    const links = [];
    const linkPattern = /\[([^\]]+)]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']+["'])?\)/gi;
    for (const match of String(markdown || '').matchAll(linkPattern)) {
        if (match.index > 0 && markdown[match.index - 1] === '!') continue;
        links.push({ text: match[1].trim(), url: cleanUrl(match[2]) });
    }
    return links;
}

export function extractMarkdownImages(markdown) {
    const images = [];
    const imagePattern = /!\[([^\]]*)]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']+["'])?\)/gi;
    for (const match of String(markdown || '').matchAll(imagePattern)) {
        images.push({ alt: match[1].trim(), url: cleanUrl(match[2]) });
    }
    return images;
}

function isAllowedUrl(url, allowedUrls = []) {
    const normalized = normalizeUrl(url);
    const allowed = new Set(allowedUrls.map(normalizeUrl));
    if (allowed.has(normalized)) return true;

    try {
        const parsed = new URL(normalized);
        return ALWAYS_ALLOWED_ORIGINS.includes(parsed.origin);
    } catch {
        return false;
    }
}

function isLikelyImageUrl(url) {
    const normalized = cleanUrl(url);
    if (/^https:\/\/images\.weserv\.nl\/\?url=/i.test(normalized)) {
        try {
            return isLikelyImageUrl(decodeURIComponent(normalized.split('?url=')[1] || ''));
        } catch {
            return false;
        }
    }
    return /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i.test(normalized);
}

function removeTableOfContents(markdown) {
    const lines = String(markdown || '').split('\n');
    const kept = [];
    let skipping = false;

    for (const line of lines) {
        if (/^#{2,3}\s*(Table of contents|目录)\s*$/i.test(line.trim())) {
            skipping = true;
            continue;
        }
        if (skipping) {
            if (
                line.trim() === '' ||
                /^\s*[-*+]\s+\[[^\]]+]\(#[^)]+\)/.test(line) ||
                /^\s*\d+\.\s+\[[^\]]+]\(#[^)]+\)/.test(line)
            ) {
                continue;
            }
            skipping = false;
        }
        kept.push(line);
    }

    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function normalizeGeneratedMarkdown(markdown, allowedUrls = []) {
    const withoutToc = removeTableOfContents(markdown);
    return withoutToc
        .replace(/!\[([^\]]*)]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']+["'])?\)/gi, (match, alt, url) => {
            const cleanedUrl = cleanUrl(url);
            const cleanedAlt = String(alt || '').trim() || '相关配图';
            if (!isAllowedUrl(cleanedUrl, allowedUrls)) return '';
            if (!isLikelyImageUrl(cleanedUrl)) {
                return `[${cleanedAlt}](${cleanedUrl})`;
            }
            return `![${cleanedAlt}](${cleanedUrl})`;
        })
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function deriveBlogDescription(markdown, fallbackTitle = '') {
    const paragraphs = String(markdown || '')
        .split(/\n{2,}/)
        .map(part => part.trim())
        .filter(Boolean)
        .filter(part => !/^#{1,6}\s/.test(part))
        .filter(part => !/^[-*_]{3,}$/.test(part))
        .filter(part => !/^>\s/.test(part))
        .filter(part => !/^!\[[^\]]*]\([^)]+\)$/.test(part))
        .filter(part => !/^Table of contents$/i.test(part));

    const source = paragraphs.find(part => stripMarkdown(part).length >= 20) || fallbackTitle;
    const description = stripMarkdown(source);
    return description.length > 120 ? `${description.slice(0, 117)}...` : description;
}

export function selectBlogSignals(dailyContent, blogType, limit = 6) {
    const patterns = blogType === 'bioai-daily' ? BIO_SIGNAL_PATTERNS : AI_SIGNAL_PATTERNS;
    const lines = String(dailyContent || '')
        .split(/\n+/)
        .map(line => line.replace(/^#+\s*/, '').trim())
        .filter(line => line.length >= 12 && line.length <= 420);

    const seen = new Set();
    const signals = [];
    for (const line of lines) {
        if (!patterns.some(pattern => pattern.test(line))) continue;
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        signals.push(line);
        if (signals.length >= limit) break;
    }

    return signals;
}

export function qualifyDailyForPersonalBlog(dailyContent, blogType) {
    if (!dailyContent || String(dailyContent).trim().length < 200) {
        return { eligible: false, reason: 'daily content missing or too short', signals: [] };
    }

    const signals = selectBlogSignals(dailyContent, blogType);
    if (signals.length === 0) {
        return {
            eligible: false,
            reason: 'no usable trigger tied to yuyu known materials',
            signals,
        };
    }

    return { eligible: true, signals };
}

function containsPersonalMaterial(markdown) {
    const text = stripMarkdown(markdown);
    const matches = PERSONAL_MATERIAL_PATTERNS.filter(pattern => pattern.test(text));
    return matches.length >= 2;
}

function countMainSiteLinks(markdown) {
    return extractMarkdownLinks(markdown).filter(link => {
        try {
            const origin = new URL(link.url).origin;
            return origin === 'https://www.aivora.cn' || origin === 'https://aivora.cn';
        } catch {
            return false;
        }
    }).length;
}

export function classifyLongSentences(markdown) {
    const text = stripMarkdown(markdown);
    const sentences = text
        .split(/(?<=[。！？!?])/)
        .map(sentence => sentence.trim())
        .filter(Boolean);

    const warnings = sentences.filter(sentence => sentence.length >= 90 && sentence.length < 170);
    const severe = sentences.filter(sentence => sentence.length >= 170);

    if (warnings.length >= 6) {
        severe.push(`long sentence count: ${warnings.length}`);
    }

    return { warnings, severe };
}

export function validateBlogDraft({ title, body, dailyContent, blogType, allowedUrls = [] }) {
    const severe = [];
    const warnings = [];
    const normalizedAllowedUrls = [...new Set([...allowedUrls, ...extractUrls(dailyContent)])];
    const text = stripMarkdown(body);

    if (!title || title.trim().length < 6 || title.length > 34) {
        severe.push('bad_title_length');
    }
    if (/^(今天|日报|AI 日报|BioAI 观察|AI 观察)/i.test(title || '')) {
        severe.push('fallback_or_daily_title');
    }
    if (!body || text.length < 350) {
        severe.push('body_too_short');
    }
    if (/Table of contents/i.test(body || '')) {
        severe.push('toc_visible');
    }
    if (!containsPersonalMaterial(body)) {
        severe.push('missing_personal_material');
    }
    if (FABRICATED_TODAY_EXPERIENCE_PATTERNS.some(pattern => pattern.test(text))) {
        severe.push('possible_fabricated_today_experience');
    }

    const unapprovedLinks = extractMarkdownLinks(body)
        .map(link => link.url)
        .filter(url => !isAllowedUrl(url, normalizedAllowedUrls));
    const invalidImages = extractMarkdownImages(body)
        .filter(image => !isAllowedUrl(image.url, normalizedAllowedUrls) || !isLikelyImageUrl(image.url));

    if (unapprovedLinks.length > 0) {
        severe.push(`unapproved_links:${unapprovedLinks.slice(0, 3).join(',')}`);
    }
    if (invalidImages.length > 0) {
        severe.push(`invalid_images:${invalidImages.slice(0, 3).map(image => image.url).join(',')}`);
    }
    if (countMainSiteLinks(body) > 1) {
        severe.push('too_many_shop_links');
    }

    const longSentences = classifyLongSentences(body);
    if (longSentences.warnings.length > 0) {
        warnings.push(`long_sentences:${longSentences.warnings.length}`);
    }
    if (longSentences.severe.length > 0) {
        severe.push(`severe_long_sentences:${longSentences.severe.length}`);
    }

    const qualification = qualifyDailyForPersonalBlog(dailyContent, blogType);
    if (!qualification.eligible) {
        severe.push(`source_not_eligible:${qualification.reason}`);
    }

    return {
        ok: severe.length === 0,
        severe,
        warnings,
        signals: qualification.signals,
    };
}
