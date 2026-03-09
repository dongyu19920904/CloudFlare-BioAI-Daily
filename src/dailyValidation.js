const AI_REQUIRED_DAILY_SECTIONS = [
    { name: '今日AI资讯', pattern: /^\s*#{1,6}\s*(?:\*\*)?(?:👀\s*)?今日\s*AI\s*资讯(?:\*\*)?\s*$/m, canonical: '## **今日AI资讯**' },
    { name: '重磅TOP10', pattern: /^\s*#{1,6}\s*(?:\*\*)?(?:🔥\s*)?重磅\s*TOP\s*10(?:（[^）]*）)?(?:\*\*)?\s*$/mi, canonical: '## **🔥 重磅 TOP 10**' },
    { name: '值得关注', pattern: /^\s*#{1,6}\s*(?:\*\*)?(?:📌\s*)?值得关注(?:（[^）]*）)?(?:\*\*)?\s*$/m, canonical: '## **📌 值得关注**' },
    { name: 'AI趋势预测', pattern: /^\s*#{1,6}\s*(?:\*\*)?(?:🔮\s*)?AI\s*趋势预测(?:（[^）]*）)?(?:\*\*)?\s*$/m, canonical: '## **🔮 AI趋势预测**' },
    { name: '相关问题', pattern: /^\s*#{1,6}\s*(?:\*\*)?(?:❓\s*)?相关问题(?:（[^）]*）)?(?:\*\*)?\s*$/m, canonical: '## **❓ 相关问题**' }
];

const BIO_REQUIRED_DAILY_SECTIONS = [
    { name: '今日AI生命科学资讯', pattern: /^\s*#{1,6}\s*(?:\*\*)?(?:👀\s*)?今日\s*AI(?:\s*生命科学)?\s*资讯(?:\*\*)?\s*$/m, canonical: '## **今日AI生命科学资讯**' },
    { name: '重磅TOP10', pattern: /^\s*#{1,6}\s*(?:\*\*)?(?:🔥\s*)?重磅\s*TOP\s*10(?:（[^）]*）)?(?:\*\*)?\s*$/mi, canonical: '## **🔥 重磅 TOP 10**' },
    { name: '值得关注', pattern: /^\s*#{1,6}\s*(?:\*\*)?(?:📌\s*)?值得关注(?:（[^）]*）)?(?:\*\*)?\s*$/m, canonical: '## **📌 值得关注**' },
    { name: 'AI趋势预测', pattern: /^\s*#{1,6}\s*(?:\*\*)?(?:🔮\s*)?AI(?:\s*生命科学)?\s*趋势预测(?:（[^）]*）)?(?:\*\*)?\s*$/m, canonical: '## **🔮 AI趋势预测**' },
    { name: '相关问题', pattern: /^\s*#{1,6}\s*(?:\*\*)?(?:❓\s*)?相关问题(?:（[^）]*）)?(?:\*\*)?\s*$/m, canonical: '## **❓ 相关问题**' }
];

function getRequiredSections(kind = 'ai') {
    return kind === 'bio' ? BIO_REQUIRED_DAILY_SECTIONS : AI_REQUIRED_DAILY_SECTIONS;
}

export function getTopItemsMinCount(env) {
    const configured = Number.parseInt(String(env?.DAILY_TOP_MIN_ITEMS ?? '').trim(), 10);
    if (Number.isFinite(configured) && configured >= 5 && configured <= 10) {
        return configured;
    }
    return 7;
}

export function normalizeDailyStructure(markdown, options = {}) {
    const kind = options.kind === 'bio' ? 'bio' : 'ai';
    let text = String(markdown || '').trim();
    if (!text) return '';

    for (const section of getRequiredSections(kind)) {
        text = text.replace(new RegExp(section.pattern.source, `${section.pattern.flags.replace(/g/g, '')}g`), section.canonical);
    }

    return text
        .replace(/^\s*#{1,6}\s*(?:\*\*)?(?:🔥\s*)?重磅\s*TOP\s*10（或更少）(?:\*\*)?\s*$/gmi, '## **🔥 重磅 TOP 10**')
        .replace(/^\s*#{1,6}\s*(?:\*\*)?(?:🔥\s*)?重磅\s*Top\s*10(?:\*\*)?\s*$/gm, '## **🔥 重磅 TOP 10**')
        .replace(/^\s*#{1,6}\s*(?:\*\*)?(?:📌\s*)?值得\s*关注(?:\*\*)?\s*$/gm, '## **📌 值得关注**')
        .replace(/^\s*#{1,6}\s*(?:\*\*)?(?:🔮\s*)?AI(?:\s*生命科学)?\s*趋势\s*预测(?:\*\*)?\s*$/gm, '## **🔮 AI趋势预测**')
        .replace(/^\s*#{1,6}\s*(?:\*\*)?(?:❓\s*)?相关\s*问题(?:\*\*)?\s*$/gm, '## **❓ 相关问题**')
        .replace(/^\s*#{1,6}\s*(?:\*\*)?(?:👀\s*)?今日\s*AI\s*资讯(?:\*\*)?\s*$/gm, '## **今日AI资讯**')
        .replace(/^\s*#{1,6}\s*(?:\*\*)?(?:👀\s*)?今日\s*AI\s*生命科学\s*资讯(?:\*\*)?\s*$/gm, '## **今日AI生命科学资讯**')
        .replace(/^\s*#{1,6}\s*(?:\*\*)?(?:👀\s*)?今日\s*AI生命科学\s*资讯(?:\*\*)?\s*$/gm, '## **今日AI生命科学资讯**')
        .trim();
}

export function getTopSectionText(markdown) {
    const text = String(markdown || '');
    const headingMatch = text.match(/^\s*#{1,6}\s*(?:\*\*)?(?:🔥\s*)?重磅\s*TOP\s*10(?:（[^）]*）)?(?:\*\*)?\s*$/mi);
    if (!headingMatch || headingMatch.index == null) return text;

    const start = headingMatch.index + headingMatch[0].length;
    const rest = text.slice(start);
    const nextSectionIndex = rest.search(/\n\s*#{1,6}\s+/);
    return nextSectionIndex >= 0 ? rest.slice(0, nextSectionIndex) : rest;
}

export function countTopItems(markdown) {
    const topSection = getTopSectionText(markdown);
    const body = topSection.replace(/^\s*#{1,6}\s+.*TOP\s*10.*(?:\r?\n)?/gmi, '');
    const numberedItems = (body.match(/^\s*\d+[\.)?]\s+/gm) || []).length;
    const headingItems = (body.match(/^\s*#{1,6}\s+\**\d+[\.)?]/gm) || []).length;
    const genericHeadingItems = (body.match(/^\s*#{2,6}\s+/gm) || []).length;
    const bulletItems = (body.match(/^\s*[-*]\s+(?:\[|\*\*|\d)/gm) || []).length;
    return Math.max(numberedItems, headingItems, genericHeadingItems, bulletItems);
}

export function validateDailyContentModules(markdown, env, options = {}) {
    const kind = options.kind === 'bio' ? 'bio' : 'ai';
    const text = normalizeDailyStructure(markdown, { kind });
    const missing = getRequiredSections(kind)
        .filter((section) => !section.pattern.test(text))
        .map((section) => section.name);

    const topCount = countTopItems(text);
    const topMin = getTopItemsMinCount(env);
    if (topCount < topMin) {
        missing.push(`TOP10(${topCount}/${topMin})`);
    }

    if (missing.length > 0) {
        throw new Error(`[Scheduled] Daily content validation failed: ${missing.join(', ')}`);
    }
}
