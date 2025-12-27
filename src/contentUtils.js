const DEFAULT_DAILY_DESCRIPTION = '每日自动汇总最新 AI 行业动态，帮中文用户用最低成本玩转ChatGPT、Claude、Cursor、Augment 等 AI 工具。由爱窝啦 AI 账号店提供支持。';

export function getYearMonth(dateStr) {
    return typeof dateStr === 'string' ? dateStr.slice(0, 7) : '';
}

function getMonthDay(dateStr) {
    return typeof dateStr === 'string' ? dateStr.slice(5, 10) : '';
}

function computeWeight(dateStr) {
    const day = Number.parseInt(String(dateStr).slice(8, 10), 10);
    if (!Number.isFinite(day)) return 0;
    const weight = 32 - day;
    return weight > 0 ? weight : 0;
}

export function buildDailyFrontMatter(dateStr, description = DEFAULT_DAILY_DESCRIPTION) {
    const monthDay = getMonthDay(dateStr);
    const weight = computeWeight(dateStr);
    return `---
linkTitle: ${monthDay}-日报
title: ${monthDay}-日报-AI资讯日报
weight: ${weight}
breadcrumbs: false
comments: true
description: "${description}"
---`;
}

function stripFrontMatter(content) {
    return String(content || '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/, '');
}

export function buildDailyContentWithFrontMatter(dateStr, content, description = DEFAULT_DAILY_DESCRIPTION) {
    const body = stripFrontMatter(content).trimStart();
    return `${buildDailyFrontMatter(dateStr, description)}\n\n${body}`;
}

function buildDefaultHomeFrontMatter(dateStr, description = DEFAULT_DAILY_DESCRIPTION) {
    const nextPath = `/${getYearMonth(dateStr)}/${dateStr}`;
    return `---
linkTitle: AI Daily
title: AI Daily-AI资讯日报
breadcrumbs: false
next: ${nextPath}
description: "${description}"
cascade:
  type: docs
---
`;
}

export function updateHomeIndexContent(existingContent, dailyContent, dateStr, description = DEFAULT_DAILY_DESCRIPTION) {
    const nextPath = `/${getYearMonth(dateStr)}/${dateStr}`;
    const frontMatterRegex = /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/;
    let frontMatter = '';

    if (existingContent && frontMatterRegex.test(existingContent)) {
        frontMatter = existingContent.match(frontMatterRegex)[0];
        if (/^next:\s*.*$/m.test(frontMatter)) {
            frontMatter = frontMatter.replace(/^next:\s*.*$/m, `next: ${nextPath}`);
        } else {
            frontMatter = frontMatter.replace(/\r?\n---\s*\r?\n$/, `\nnext: ${nextPath}\n---\n`);
        }
    } else {
        frontMatter = buildDefaultHomeFrontMatter(dateStr, description);
    }

    const body = stripFrontMatter(dailyContent).trimStart();
    return frontMatter.trimEnd() + '\n\n' + body;
}
