const DEFAULT_DAILY_DESCRIPTION = '每日自动汇总最新 AI 行业动态，帮中文用户用最低成本玩转ChatGPT、Claude、Cursor、Augment 等 AI 工具。由爱窝啦 AI 账号店提供支持。';

// 辅助函数：获取月日
function getMonthDay(dateStr) {
    return typeof dateStr === 'string' ? dateStr.slice(5, 10) : '';
}

// 辅助函数：计算权重
function computeWeight(dateStr) {
    const day = Number.parseInt(String(dateStr).slice(8, 10), 10);
    if (!Number.isFinite(day)) return 0;
    const weight = 32 - day;
    return weight > 0 ? weight : 0;
}

// 辅助函数：去除 Front Matter
function stripFrontMatter(content) {
    return String(content || '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/, '');
}

export function getYearMonth(dateStr) {
    return typeof dateStr === 'string' ? dateStr.slice(0, 7) : '';
}

/**
 * 计算月份目录的权重（递减公式，新月份权重更小）
 * 使用足够大的基础值，然后减去年份和月份，确保新月份权重更小
 * 在 Hugo 的升序排序中，权重小的会排在前面，从而实现新月份排在最前
 * @param {string} yearMonth - 格式：YYYY-MM
 * @returns {number} 权重值
 */
export function computeMonthDirectoryWeight(yearMonth) {
    if (!yearMonth || typeof yearMonth !== 'string') return 0;
    const parts = yearMonth.split('-');
    if (parts.length !== 2) return 0;
    const year = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return 0;
    
    // 递减公式：新月份权重更小，在升序排序时会排在前面
    // 使用足够大的基础值，确保所有月份的权重都是正数
    const baseWeight = 1000000; // 基础值，足够大以容纳未来很多年
    const yearWeight = (year - 2000) * 12; // 年份权重：2025=300, 2026=312, 2027=324...
    const monthWeight = month; // 月份权重：1-12
    
    // 新月份权重 = 基础值 - 年份权重 - 月份权重
    // 2026-01: 1000000 - 312 - 1 = 999687 (最小，排在最前)
    // 2025-12: 1000000 - 300 - 12 = 999688
    // 2025-06: 1000000 - 300 - 6 = 999694 (最大，排在最后)
    return baseWeight - yearWeight - monthWeight;
}

/**
 * 创建月份目录的 _index.md 内容
 * @param {string} yearMonth - 格式：YYYY-MM
 * @param {object} options - 选项
 * @returns {string} _index.md 文件内容
 */
export function buildMonthDirectoryIndex(yearMonth, options = {}) {
    const { sidebarOpen = false } = options;
    const weight = computeMonthDirectoryWeight(yearMonth);
    return `---
title: ${yearMonth}
weight: ${weight}
breadcrumbs: false
sidebar:
  open: ${sidebarOpen}
---
`;
}

export function buildDailyFrontMatter(dateStr, options = {}) {
    const { description = DEFAULT_DAILY_DESCRIPTION, title } = options;
    const monthDay = getMonthDay(dateStr);
    const weight = computeWeight(dateStr);
    const resolvedTitle = title === undefined ? `${monthDay}-日报-AI资讯日报` : title;
    return `---
linkTitle: ${monthDay}-日报
title: ${resolvedTitle}
weight: ${weight}
breadcrumbs: false
comments: true
description: "${description}"
---`;
}

export function buildDailyContentWithFrontMatter(dateStr, content, options = {}) {
    const body = stripFrontMatter(content).trimStart();
    return `${buildDailyFrontMatter(dateStr, options)}\n\n${body}`;
}

function buildDefaultHomeFrontMatter(dateStr, options = {}) {
    const { description = DEFAULT_DAILY_DESCRIPTION, title } = options;
    const nextPath = `/${getYearMonth(dateStr)}/${dateStr}`;
    const resolvedTitle = title === undefined ? 'AI Daily-AI资讯日报' : title;
    return `---
linkTitle: AI Daily
title: ${resolvedTitle}
breadcrumbs: false
next: ${nextPath}
description: "${description}"
cascade:
  type: docs
---
`;
}

export function updateHomeIndexContent(existingContent, dailyContent, dateStr, options = {}) {
    const { description = DEFAULT_DAILY_DESCRIPTION, title } = options;
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
        if (title !== undefined) {
            if (/^title:\s*.*$/m.test(frontMatter)) {
                frontMatter = frontMatter.replace(/^title:\s*.*$/m, `title: ${title}`);
            } else if (/^linkTitle:\s*.*$/m.test(frontMatter)) {
                frontMatter = frontMatter.replace(/^linkTitle:\s*.*$/m, (match) => `${match}\ntitle: ${title}`);
            } else {
                frontMatter = frontMatter.replace(/^---\s*\r?\n/, (match) => `${match}title: ${title}\n`);
            }
        }
    } else {
        frontMatter = buildDefaultHomeFrontMatter(dateStr, { description, title });
    }

    const body = stripFrontMatter(dailyContent).trimStart();
    return frontMatter.trimEnd() + '\n\n' + body;
}
