import {
    buildAllowedSourceUrls,
    normalizeCanonicalUrl,
    resolveDailyPrimarySource,
} from './bioDailyEvidence.js';

const SIGNAL_SECTION_PATTERN = /^##\s+\*{0,2}今日信号\*{0,2}\s*$/im;
const SIGNAL_HEADING_PATTERN = /^###\s+(?:\d+[.)]\s*)?(.+?)\s*$/gm;
const REQUIRED_FIELD_GROUPS = [
    { label: '一句话结论', aliases: ['一句话结论', '直接结论'] },
    { label: '发生了什么', aliases: ['发生了什么'] },
    { label: '为什么重要', aliases: ['为什么重要', '意味着什么'] },
    { label: '证据说明', aliases: ['证据说明'] },
    { label: '目前不能得出', aliases: ['目前不能得出', '不能得出什么结论'] },
    { label: '来源', aliases: ['来源'] },
];

const CLINICAL_OVERCLAIM_PATTERNS = [
    /(?:已经|已被|研究)?(?:证实|证明).{0,18}(?:治愈|逆转衰老|延长人类寿命|阻止衰老)/i,
    /(?:对所有人|人人).{0,12}(?:有效|适用|安全)/i,
    /(?:无需|不必).{0,10}(?:医生|临床试验|进一步验证)/i,
    /(?:建议|应该|立即).{0,12}(?:服用|停药|换药|接受治疗)/i,
];

function normalizeFieldLabel(label) {
    return String(label || '').replace(/[：:]/g, '').replace(/[*_`\s]/g, '').trim();
}

function extractSignalCards(markdown) {
    const content = String(markdown || '');
    const sectionMatch = content.match(SIGNAL_SECTION_PATTERN);
    if (!sectionMatch || sectionMatch.index == null) return [];
    const sectionStart = sectionMatch.index + sectionMatch[0].length;
    const remainder = content.slice(sectionStart);
    const nextSection = remainder.search(/^##\s+/m);
    const signalBody = nextSection >= 0 ? remainder.slice(0, nextSection) : remainder;
    const headings = [...signalBody.matchAll(SIGNAL_HEADING_PATTERN)];
    return headings.map((heading, index) => {
        const start = (heading.index || 0) + heading[0].length;
        const end = index + 1 < headings.length ? headings[index + 1].index : signalBody.length;
        return {
            title: heading[1].replace(/\*+/g, '').trim(),
            body: signalBody.slice(start, end).trim(),
        };
    });
}

function hasRequiredField(body, fields) {
    const normalizedFields = new Set(fields.map(normalizeFieldLabel));
    const lines = String(body || '').split(/\r?\n/);
    return lines.some((line) => {
        const match = line.match(/^\s*(?:[-*]\s*)?\*{0,2}([^：:]+)\*{0,2}\s*[：:]/);
        return match && normalizedFields.has(normalizeFieldLabel(match[1])) && line.split(/[：:]/).slice(1).join(':').trim().length > 0;
    });
}

function extractLinks(markdown) {
    const imageRanges = [...String(markdown || '').matchAll(/!\[[^\]]*\]\([^\n)]+\)/g)]
        .map((match) => [match.index || 0, (match.index || 0) + match[0].length]);
    return [...String(markdown || '').matchAll(/\[[^\]]+\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g)]
        .filter((match) => !imageRanges.some(([start, end]) => (match.index || 0) >= start && (match.index || 0) < end))
        .map((match) => match[1]);
}

function buildAllowedMediaMap(candidates = []) {
    const map = new Map();
    for (const candidate of candidates) {
        const mediaItems = Array.isArray(candidate?.media) && candidate.media.length > 0
            ? candidate.media
            : (candidate?.mediaUrl ? [{ url: candidate.mediaUrl }] : []);
        for (const media of mediaItems) {
            if (!/^https?:\/\//i.test(media?.url || '')) continue;
            map.set(normalizeCanonicalUrl(media.url), {
                title: String(media.alt || candidate.title || '研究相关图片').replace(/[\[\]"]/g, '').trim(),
                source: String(media.source || candidate.source || '原始来源').replace(/[\[\]"]/g, '').trim(),
                sourceUrl: normalizeCanonicalUrl(media.sourceUrl || resolveDailyPrimarySource(candidate) || candidate.url),
            });
        }
    }
    return map;
}

function candidateAllowsLink(candidate, link) {
    const normalized = normalizeCanonicalUrl(link);
    return buildAllowedSourceUrls([candidate]).has(normalized);
}

function evidenceLevelFromCard(body) {
    const match = String(body || '').match(/\*{0,2}证据说明\*{0,2}\s*[：:]\s*\*{0,2}(高|中|初步)(?:证据)?\*{0,2}/);
    return match ? match[1] : '';
}

export function sanitizeBioDailyMedia(markdown, candidates = []) {
    const mediaMap = buildAllowedMediaMap(candidates);
    return String(markdown || '').replace(
        /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"([^"]*)")?\)/g,
        (match, alt, url) => {
            const metadata = mediaMap.get(normalizeCanonicalUrl(url));
            if (!metadata) return '';
            const resolvedAlt = String(alt || '').trim();
            const usefulAlt = !resolvedAlt || /^(?:图片|image|配图|AI资讯图片)$/i.test(resolvedAlt)
                ? metadata.title
                : resolvedAlt;
            return `![${usefulAlt}](${url} "来源：${metadata.source}")`;
        }
    ).replace(/\n{3,}/g, '\n\n').trim();
}

export function validateBioDailyMarkdown(markdown, candidates = [], options = {}) {
    const minItems = Number.isFinite(Number(options.minItems)) ? Number(options.minItems) : 5;
    const maxItems = Number.isFinite(Number(options.maxItems)) ? Number(options.maxItems) : 8;
    const errors = [];
    const warnings = [];
    const content = String(markdown || '').trim();
    const cards = extractSignalCards(content);
    const allowedUrls = buildAllowedSourceUrls(candidates);

    if (!/^##\s+\*{0,2}今日结论\*{0,2}/m.test(content)) errors.push('缺少“今日结论”二级标题');
    if (!/^##\s+\*{0,2}三分钟速读\*{0,2}/m.test(content)) errors.push('缺少“三分钟速读”二级标题');
    if (!SIGNAL_SECTION_PATTERN.test(content)) errors.push('缺少“今日信号”二级标题');
    if (cards.length < minItems || cards.length > maxItems) {
        errors.push(`今日信号必须为 ${minItems}-${maxItems} 条，当前为 ${cards.length} 条`);
    }

    const seenTitles = new Set();
    cards.forEach((card, index) => {
        const label = `第 ${index + 1} 条`;
        if (/\[[^\]]+\]\(/.test(card.title)) errors.push(`${label}标题必须是纯文本，不能挂链接`);
        const normalizedTitle = card.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        if (normalizedTitle && seenTitles.has(normalizedTitle)) errors.push(`${label}与前文标题重复`);
        if (normalizedTitle) seenTitles.add(normalizedTitle);
        for (const field of REQUIRED_FIELD_GROUPS) {
            if (!hasRequiredField(card.body, field.aliases)) errors.push(`${label}缺少字段：${field.label}`);
        }
        const evidenceLevel = evidenceLevelFromCard(card.body);
        if (!evidenceLevel) {
            errors.push(`${label}证据说明必须以“高/中/初步证据”开头并解释依据`);
        }
        for (const detail of ['研究类型', '对象/样本', '发表状态', '利益关系', '距离应用']) {
            if (!card.body.includes(detail)) errors.push(`${label}证据说明缺少：${detail}`);
        }
        if (!/\*{0,2}(?:目前不能得出|不能得出什么结论)\*{0,2}\s*[：:].{12,}/s.test(card.body)) {
            errors.push(`${label}必须明确说明目前不能得出的结论`);
        }
        const sourceLinks = extractLinks(card.body);
        if (sourceLinks.length === 0) errors.push(`${label}没有可点击来源`);
        for (const link of sourceLinks) {
            const normalized = normalizeCanonicalUrl(link);
            if (!allowedUrls.has(normalized)) errors.push(`${label}使用了未在候选素材中出现的来源：${link}`);
        }
        const matchedCandidates = candidates.filter((candidate) => sourceLinks.some((link) => candidateAllowsLink(candidate, link)));
        const researchCandidates = matchedCandidates.filter((candidate) => candidate.pool === 'research' || candidate.sourceType === 'paper');
        if (researchCandidates.length > 0) {
            const hasPrimaryLink = researchCandidates.some((candidate) => {
                const primaryUrl = resolveDailyPrimarySource(candidate);
                return primaryUrl && sourceLinks.some((link) => normalizeCanonicalUrl(link) === primaryUrl);
            });
            if (!hasPrimaryLink) errors.push(`${label}生物医学研究必须链接论文、注册平台或机构原文`);
        }
    });

    if (/https?:\/\/(?:www\.)?aivora\.cn/i.test(content)) {
        errors.push('普通日报默认不得插入爱窝啦商品或首页链接');
    }
    const positiveClaimText = content
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:[-*]\s*)?\*{0,2}[^：:\n]+\*{0,2}\s*[：:]\s*/, ''))
        .filter((line) => !/(?:不能|不得|尚未|无法|不代表|不等于|没有证据)/.test(line))
        .join('\n');
    for (const pattern of CLINICAL_OVERCLAIM_PATTERNS) {
        if (pattern.test(positiveClaimText)) errors.push(`检测到临床或抗衰夸大表达：${pattern.source}`);
    }
    if (/##\s+.*(?:趋势预测|相关问题|FAQ)/i.test(content)) {
        warnings.push('预测或 FAQ 不是普通日报必选模块，建议删除无充分依据的内容');
    }

    const imageMatches = [...content.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"([^"]*)")?\)/g)];
    const mediaMap = buildAllowedMediaMap(candidates);
    const uniqueImageUrls = new Set(imageMatches.map((image) => normalizeCanonicalUrl(image[2])));
    const requiredImageCount = Math.min(2, mediaMap.size);
    if (uniqueImageUrls.size < requiredImageCount) {
        errors.push(`已有 ${mediaMap.size} 张通过校验的候选图片，正文至少应使用 ${requiredImageCount} 张`);
    }
    if (uniqueImageUrls.size > 4) errors.push('正文图片最多 4 张，避免图片喧宾夺主');
    if (mediaMap.size === 0) warnings.push('本期没有通过来源与可用性校验的外部图片，将由前端证据概览信息图兜底');
    for (const image of imageMatches) {
        if (!mediaMap.has(normalizeCanonicalUrl(image[2]))) errors.push(`图片不在候选素材允许列表：${image[2]}`);
        if (!image[1] || /^(?:图片|image|配图|AI资讯图片)$/i.test(image[1].trim())) errors.push('图片 alt 必须描述真实信息');
        if (!image[3] || !/^来源[：:]/.test(image[3])) errors.push('图片必须包含“来源：...”图注');
    }

    return {
        passed: errors.length === 0,
        errors: [...new Set(errors)],
        warnings: [...new Set(warnings)],
        itemCount: cards.length,
        cards,
    };
}

export function summarizeBioDailyEvidence(markdown) {
    const content = String(markdown || '');
    const counts = { high: 0, medium: 0, preliminary: 0 };
    counts.high = (content.match(/证据说明\*{0,2}\s*[：:]\s*\*{0,2}高(?:证据)?/g) || []).length;
    counts.medium = (content.match(/证据说明\*{0,2}\s*[：:]\s*\*{0,2}中(?:证据)?/g) || []).length;
    counts.preliminary = (content.match(/证据说明\*{0,2}\s*[：:]\s*\*{0,2}初步(?:证据)?/g) || []).length;
    const parts = [];
    if (counts.high) parts.push(`高 ${counts.high}`);
    if (counts.medium) parts.push(`中 ${counts.medium}`);
    if (counts.preliminary) parts.push(`初步 ${counts.preliminary}`);
    return parts.length ? parts.join(' · ') : '逐条说明研究设计与局限';
}

export function shouldAdoptBioDailyRepair(initialValidation, repairedValidation) {
    if (!repairedValidation?.passed) return false;
    if (!initialValidation?.passed) return true;
    return repairedValidation.warnings.length < initialValidation.warnings.length;
}

export function buildBioDailyRepairSystemPrompt(validationErrors, candidates = []) {
    const allowed = [...buildAllowedSourceUrls(candidates)].join('\n');
    return `你是 AI 生命延续学日报的定向修订编辑。只修复下列校验错误，保留已经正确的事实、数字和栏目结构。\n\n校验错误：\n- ${validationErrors.join('\n- ')}\n\n允许使用的来源 URL（不得新增）：\n${allowed}\n\n每条只保留“一句话结论、发生了什么、为什么重要、证据说明、目前不能得出、来源”六个阅读字段。证据说明必须在一个紧凑段落中写明证据等级、研究类型、对象/样本、发表状态、利益关系和距离应用。必须输出完整修订后的 Markdown，不解释修订过程。不得补写素材没有提供的样本量、疗效或医学结论；信息缺失时明确写“素材未报告”，证据保持“初步”。`;
}

export function assembleBioDailyMarkdown(body, summary) {
    const summaryLines = String(summary || '')
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 3);
    const summaryBlock = summaryLines.length
        ? `> ${summaryLines.join('\n> ')}`
        : '> 今日内容已按研究设计、证据强弱和实际应用距离完成审查。';
    return `${summaryBlock}\n\n${String(body || '').trim()}\n\n---\n\n## 编辑说明\n\n本文由 **AI生命延续学编辑部** 整理，优先链接论文、临床试验注册、公共机构和项目官方仓库。证据等级用于帮助判断研究成熟度，不代表个体医疗结论。\n\n> **健康信息免责声明：** 本站内容仅用于科研资讯与公众教育，不提供诊断、治疗、用药或抗衰承诺。涉及个人健康决策时，请咨询具备资质的医疗专业人员。`;
}
