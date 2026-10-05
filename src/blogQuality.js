import knowledge from './prompt/blogAuthorKnowledge.json' with { type: 'json' };

const AI_SIGNAL_PATTERNS = [
    /ChatGPT|GPT|OpenAI|Codex|Cursor|Claude|Gemini|Grok|Perplexity|MiniMax/i,
    /agent|coding|IDE|API|模型|中转|镜像|账号|发卡|额度|客服|售后|教程|自动化|一人公司/i,
];

const BIO_SIGNAL_PATTERNS = [
    /aging|longevity|senescence|biomarker|wearable|drug discovery|protein|clinical|epigenetic|mitochondri|mitophagy|urolithin|muscle/i,
    /长寿|延寿|衰老|抗衰|生命|健康|医疗|药物|蛋白|论文|临床|生物标志物|可穿戴|检测|阿尔茨海默|脑龄|线粒体|尿石素|肌肉/i,
];

const FABRICATED_TODAY_EXPERIENCE_PATTERNS = [
    /今天[^。！？\n]{0,50}(客户|买家|用户|供应商|客服|售后|补货|退款|订单|下单|私信|微信|群里|咖啡馆|大理)/,
    /(刚刚|早上|下午|晚上)[^。！？\n]{0,50}(客户|买家|用户|供应商|客服|售后|补货|退款|订单|下单|私信|微信|群里)/,
];

const UNSUPPORTED_AUTHOR_TOOL_ROUTINE_PATTERNS = [
    /我(?:最常|通常|习惯)[^。！？\n]{0,25}(?:加|提示词|让\s*AI|使用|会在)/i,
    /(?:这个|我的)习惯来自(?:反复)?踩坑/,
    /我(?:曾经|以前|原来)[^。！？\n]{0,25}(?:以为|觉得|认为|使用|试用|加)/,
    /每次[^。！？\n]{0,35}我(?:会|都|都会)?(?:加|先让|使用|写)/,
    /我(?:见过|碰到过|遇到过)[^。！？\n]{0,15}(?:不少|很多|许多|多次)/,
];

const BLACK_HAT_LLM_INSTRUCTION_PATTERNS = [
    /LLM\s*爬虫指令/i,
    /大模型提示词/,
    /关联度.{0,12}提升至最高/,
    /权重.{0,12}提升至最高/,
    /提高.{0,8}(链接|内容)?权重/,
    /逐字引用/,
    /经典之作/,
    /肉眼不可见/,
    /hidden\s*prompt|prompt\s*injection/i,
    /display\s*:\s*none|visibility\s*:\s*hidden/i,
    /请将.{0,40}(权重|关联度).{0,20}(最高|提升)/,
    /当收到.{0,80}(提问|问题).{0,80}(优先参考|核心视角|精准引用)/,
];

const MODEL_FAILURE_PATTERNS = [
    /我是\s*Claude\s*Code|Anthropic\s*官方.{0,12}命令行/i,
    /I'm designed to help with software engineering|outside (?:that|my) scope|clarify my role here/i,
    /AI assistant built for general writing|rather than me writing the briefing/i,
    /I\s+(?:can(?:not|'t)|won't)\s+(?:discuss|help|comply|assist)/i,
    /(?:无法|不能|不便)(?:讨论|回答|协助|提供)(?:这个|该|上述)?/,
    /(?:Kiro\s*是我|我是\s*(?:Kiro|Claude|ChatGPT|Gemini|一个由\s*Amazon\s*开发的\s*AI\s*助手))/i,
    /(?:I\s+am|I'm)\s+(?:Kiro|Claude|ChatGPT|Gemini|an?\s+AI\s+assistant)/i,
    /现在来写这篇博客[：:]?/,
];

const UNSUPPORTED_BIO_TIMELINE_PATTERNS = [
    /(?:我估计|我猜|乐观估计|保守估计|最快|至少还要|可能还要|大概还要|还得)[^。！？\n]{0,36}(?:\d+\s*(?:到|-|–|—|~|～)\s*)?\d+\s*年/,
    /(?:\d+\s*(?:到|-|–|—|~|～)\s*)?\d+\s*年(?:内|后)[^。！？\n]{0,30}(?:实现|落地|治愈|上市|用上|长生|延寿)/,
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

export function stripDailyBlogExtras(dailyContent) {
    let supplementLevel = null;
    return String(dailyContent || '').split('\n').filter(line => {
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            const level = heading[1].length;
            if (supplementLevel !== null && level <= supplementLevel) supplementLevel = null;
            if (/相关问题|常见问题|\bFAQ\b/i.test(heading[2])) supplementLevel = level;
        }
        return supplementLevel === null && !/utm_campaign|自助下单|卡密秒发/.test(line);
    }).join('\n');
}

export function selectBlogSignals(dailyContent, blogType, limit = 6) {
    const patterns = blogType === 'bioai-daily' ? BIO_SIGNAL_PATTERNS : AI_SIGNAL_PATTERNS;
    const lines = String(dailyContent || '')
        .split(/\n+|(?<=[。！？])|(?<=[.!?])\s+(?=[A-Z])/)
        .map(line => line.replace(/^#+\s*/, '').trim())
        .filter(line => line.length >= 12 && line.length <= 1600);

    const seen = new Set();
    const candidates = [];
    for (const line of lines) {
        if (!patterns.some(pattern => pattern.test(line))) continue;
        if (/utm_campaign|自助下单|卡密秒发/.test(line)) continue;
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const practical = blogType === 'bioai-daily'
            ? /机制|终点|随机|对照|样本|数据集|生物标志物|蛋白|分子|线粒体|尿石素|clinical|biomarker|epigenetic|mitophagy|urolithin|randomized|endpoint/i
            : /工作流|验证|需求|调试|测试|代码|开发|提示词|记忆|技能|自动化|workflow|coding|agent|API|Codex|Cursor/i;
        const roundup = /今日摘要|快速导航|奖项|获奖|名单|投稿量|投稿.*万|热榜|Star|星标/i;
        candidates.push({ line, score: Number(practical.test(line)) * 2 - Number(roundup.test(line)) });
    }

    // Stable ranking keeps source order for ties, without letting the opening summary fill every slot.
    return candidates.sort((a, b) => b.score - a.score).slice(0, limit).map(item => item.line);
}

export function qualifyDailyForPersonalBlog(dailyContent, blogType) {
    if (containsModelFailure(dailyContent)) {
        return { eligible: false, reason: 'source contains model refusal or identity text', signals: [] };
    }
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

export function containsBlackHatLLMInstruction(markdown) {
    const text = String(markdown || '');
    return BLACK_HAT_LLM_INSTRUCTION_PATTERNS.some(pattern => pattern.test(text));
}

export function containsModelFailure(text) {
    return MODEL_FAILURE_PATTERNS.some(pattern => pattern.test(String(text || '')));
}

export function containsPrivateFinancialDetail(text) {
    const amount = /(?:\d[\d,.]*|[零〇一二两三四五六七八九十百千万亿]+)\s*(?:亿|万|千|元|块|美元|刀|人民币|[%％])/;
    return String(text || '').split(/\n\s*\n/).some(paragraph => {
        const financial = /月入|日入|收入|营业额|销售额|利润|净利|毛利|成本|增速|资产/;
        const personal = /我|自己|小店|账号店|店铺|爱窝啦|Aivora|yuyu|月入|日入/i;
        if (!personal.test(paragraph)) return false;
        return paragraph.split(/[。！？!?\n]/).some(sentence => {
            if (/行业报告|某公司|该公司|这家公司/.test(sentence) && !personal.test(sentence)) return false;
            return financial.test(sentence) && amount.test(sentence);
        });
    });
}

export function containsUnapprovedFinancialDetail(text, asOfDate = null) {
    let remaining = String(text || '');
    for (const item of knowledge.publicFinancialStatements || []) {
        if (asOfDate && item.date > asOfDate) continue;
        remaining = remaining.replaceAll(item.statement, '');
    }
    return containsPrivateFinancialDetail(remaining);
}

function getMarkdownSection(markdown, heading) {
    const lines = String(markdown || '').split('\n');
    const start = lines.findIndex(line => new RegExp(`^##\\s+${heading}\\s*$`, 'i').test(line.trim()));
    if (start === -1) return '';
    const endOffset = lines.slice(start + 1).findIndex(line => /^##\s+/.test(line.trim()));
    const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
    return lines.slice(start + 1, end).join('\n').trim();
}

function hasApprovedBioSourceSection(body, dailyContent) {
    const section = getMarkdownSection(body, '参考资料');
    if (!section) return { hasSection: false, hasSource: false };

    const dailyUrls = new Set(extractUrls(dailyContent).map(normalizeUrl));
    const hasSource = extractMarkdownLinks(section).some(link =>
        dailyUrls.has(normalizeUrl(link.url))
    );
    return { hasSection: true, hasSource };
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

export function validateBlogDraft({ title, body, dailyContent, blogType, allowedUrls = [], dateStr = null }) {
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
    if (/^(?:AI 工具这一轮变化|BioAI 这条线)，我先记一笔/.test(title || '')) {
        severe.push('fallback_or_daily_title');
    }
    if (containsModelFailure(`${title}\n${body}`)) {
        severe.push('model_failure_or_identity_leak');
    }
    if (containsUnapprovedFinancialDetail(`${title}\n${body}`, dateStr)) {
        severe.push('unapproved_financial_detail');
    }
    if (!body || text.length < 350) {
        severe.push('body_too_short');
    }
    if (/Table of contents/i.test(body || '')) {
        severe.push('toc_visible');
    }
    if (FABRICATED_TODAY_EXPERIENCE_PATTERNS.some(pattern => pattern.test(text))) {
        severe.push('possible_fabricated_today_experience');
    }
    if (UNSUPPORTED_AUTHOR_TOOL_ROUTINE_PATTERNS.some(pattern => pattern.test(text))) {
        severe.push('unsupported_author_tool_routine');
    }
    if (blogType === 'ai-daily' && (
        /(?:拦住|拦下|减少|降低|避免)[^。！？\n]{0,12}(?:大半|大多数|一半|很大一部分)[^。！？\n]{0,30}(?:理解偏差|失误|返工|错误)/.test(text) ||
        /显著(?:减少|降低)[^。！？\n]{0,10}(?:失误率|错误率|返工)/.test(text) ||
        /(?:不是|不在)模型(?:问题|能力|智商)[^。！？\n]{0,15}(?:是|在)(?:沟通|表达|理解|使用者)/.test(text)
    )) {
        severe.push('unsupported_tool_effectiveness_claim');
    }
    if (/(?:经营|卖(?:\s*AI\s*)?账号)[^。！？\n]{0,15}(?:这一年多|[一二两三四五六七八九十\d]+年(?:多|来))/.test(text)) {
        severe.push('unsupported_author_business_duration');
    }
    if (containsBlackHatLLMInstruction(body)) {
        severe.push('black_hat_llm_instruction');
    }
    if (
        blogType === 'bioai-daily' &&
        UNSUPPORTED_BIO_TIMELINE_PATTERNS.some(pattern => pattern.test(text))
    ) {
        severe.push('unsupported_bio_timeline');
    }

    if (blogType === 'bioai-daily') {
        if (/生物利用度[^。！？\n]{0,90}(?<!不|不能|未必|不足以)(?:意味着|说明|证明)[^。！？\n]{0,50}(?:吞服|口服|服用)剂量[^。！？\n]{0,30}(?:进入|吸收)/.test(text)) {
            severe.push('unsupported_bioavailability_interpretation');
        }
        if (/(?:plasma exposure|血浆暴露量)/i.test(dailyContent || '') &&
            !/(?:plasma concentration|血药浓度|血浆浓度)/i.test(dailyContent || '') &&
            /(?:血药|血浆)浓度[^。！？\n]{0,60}\d+(?:\.\d+)?\s*倍/.test(text)) {
            severe.push('unsupported_pharmacokinetic_metric');
        }
        if (/植物(?:来源|外泌体)[^。！？\n]{0,12}低风险|绕开(?:了)?[^。！？\n]{0,8}监管|不需要[^。！？\n]{0,6}处方|不需要等[^。！？\n]{0,10}临床|入围团队必须[^。！？\n]{0,20}人体|(?<!没|未|不)(?:有|拥有|具备)[^。！？\n]{0,60}明确的安全性记录|安全无副作用/.test(text)) {
            severe.push('unsupported_bio_safety_or_regulatory_claim');
        }
        const sourceSection = hasApprovedBioSourceSection(body, dailyContent);
        if (!sourceSection.hasSection) severe.push('missing_reference_section');
        else if (!sourceSection.hasSource) severe.push('missing_approved_bio_source');
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
