const GENERIC_HEADING_PATTERNS = [
    /^(今日|本期)?(摘要|速览|导航|结论|重点|目录|信号分布|来源说明)$/i,
    /^(相关问题|FAQ|免责声明|参考来源|数据来源|延伸阅读|行动清单)$/i,
    /^(先看|今日|本期).*(信号|结论|主推|优先|备选|观察|避坑|行动|项目)/i,
    /^(今日 AI 资讯|开源项目|社交媒体|有趣的事|趋势预测)$/i,
    /^(AI生命延续学|生命延续学).*(日报|商机|项目)$/i,
];

function cleanInlineMarkdown(value) {
    return String(value || '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[`*_~>|]/g, '')
        .replace(/^\s*(?:\d+[.)、]|[-+])\s*/, '')
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isUsefulHeading(heading) {
    if (!heading || heading.length < 4 || heading.length > 70) return false;
    return !GENERIC_HEADING_PATTERNS.some((pattern) => pattern.test(heading));
}

export function stripFrontMatter(markdown) {
    return String(markdown || '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/, '');
}

export function stripLeadingReportHeading(markdown) {
    const body = stripFrontMatter(markdown).trimStart();
    return body.replace(/^#(?!#)\s+[^\r\n]+\r?\n+(?:\s*>?\s*(?:报告日期|日期)[:：][^\r\n]+\r?\n+)?/u, '').trimStart();
}

export function extractReportTopics(markdown, limit = 3) {
    const body = stripFrontMatter(markdown);
    const headings = [...body.matchAll(/^#{2,4}\s+(.+)$/gm)]
        .map((match) => cleanInlineMarkdown(match[1]))
        .filter(isUsefulHeading);

    const unique = [];
    const seen = new Set();
    for (const heading of headings) {
        const key = heading.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(heading);
        if (unique.length >= limit) break;
    }
    return unique;
}

function extractPlainText(markdown) {
    return cleanInlineMarkdown(
        stripFrontMatter(markdown)
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^\s*[-*+]\s+/gm, '')
    );
}

function trimDescription(value, maxLength) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(1, maxLength - 1)).replace(/[，、；：,.!?。！？\s]+$/u, '')}…`;
}

export function buildReportDescription(markdown, options = {}) {
    const {
        dateStr = '',
        label = 'AI生命延续学日报',
        fallback = '聚焦 AI 与长寿、衰老、生物年龄和生命科学交叉领域的最新进展。',
        suffix = '包含来源、证据边界与可执行判断。',
        maxLength = 155,
    } = options;
    const topics = extractReportTopics(markdown, 3);
    const prefix = [dateStr, label].filter(Boolean).join(' ');

    if (topics.length > 0) {
        return trimDescription(`${prefix}：${topics.join('；')}。${suffix}`, maxLength);
    }

    const plainText = extractPlainText(markdown);
    if (plainText) {
        return trimDescription(`${prefix}：${plainText}`, maxLength);
    }

    return trimDescription(`${prefix}：${fallback}`, maxLength);
}

export function extractFirstReportImage(markdown) {
    const body = stripFrontMatter(markdown);
    const markdownImage = body.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+["'][^)]*["'])?\)/i);
    if (markdownImage) return markdownImage[1];

    const htmlImage = body.match(/<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/i);
    return htmlImage ? htmlImage[1] : '';
}
