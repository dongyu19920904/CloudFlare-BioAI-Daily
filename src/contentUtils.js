const DEFAULT_DAILY_DESCRIPTION = '每日精选 AI、衰老、长寿、健康寿命与生物年龄研究信号，说明研究设计、证据强弱、局限和距离实际应用的阶段。';

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
    const {
        description = DEFAULT_DAILY_DESCRIPTION,
        title,
        evidenceSummary = '逐条说明研究设计与局限',
        applicationDistance = '研究与验证阶段，不能用于个人医疗决策',
    } = options;
    const monthDay = getMonthDay(dateStr);
    const weight = computeWeight(dateStr);
    const resolvedTitle = title === undefined ? `${monthDay}-日报-AI资讯日报` : title;
    return `---
linkTitle: ${monthDay}-日报
title: ${resolvedTitle}
date: ${dateStr}T00:00:00+08:00
lastmod: ${dateStr}T00:00:00+08:00
weight: ${weight}
breadcrumbs: false
comments: true
description: "${description}"
authorName: "AI生命延续学编辑部"
authorType: "Organization"
editor: "AI生命延续学编辑部"
evidenceSummary: "${evidenceSummary}"
applicationDistance: "${applicationDistance}"
---`;
}

export function buildDailyContentWithFrontMatter(dateStr, content, options = {}) {
    const body = stripFrontMatter(content).trimStart();
    return `${buildDailyFrontMatter(dateStr, options)}\n\n${body}`;
}

function buildDefaultHomeFrontMatter(dateStr, options = {}) {
    const {
        description = DEFAULT_DAILY_DESCRIPTION,
        title,
        linkTitle = 'BioAI 生命科学日报'
    } = options;
    const nextPath = `/${getYearMonth(dateStr)}/${dateStr}`;
    const resolvedTitle = title === undefined ? linkTitle : title;
    return `---
linkTitle: ${linkTitle}
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
    const {
        description = DEFAULT_DAILY_DESCRIPTION,
        title,
        linkTitle
    } = options;
    const nextPath = `/${getYearMonth(dateStr)}/${dateStr}`;
    const frontMatterRegex = /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/;
    let frontMatter = '';

    if (existingContent && frontMatterRegex.test(existingContent)) {
        frontMatter = existingContent.match(frontMatterRegex)[0];
        const existingNextDateMatch = frontMatter.match(/^next:\s*\/\d{4}-\d{2}\/(\d{4}-\d{2}-\d{2})\s*$/m);
        if (existingNextDateMatch && existingNextDateMatch[1] > dateStr) {
            // Prevent older runs from overwriting a newer homepage.
            return existingContent;
        }
        if (/^next:\s*.*$/m.test(frontMatter)) {
            frontMatter = frontMatter.replace(/^next:\s*.*$/m, `next: ${nextPath}`);
        } else {
            frontMatter = frontMatter.replace(/\r?\n---\s*\r?\n$/, `\nnext: ${nextPath}\n---\n`);
        }

        // Update title and linkTitle if provided
        if (title !== undefined) {
            if (/^title:\s*.*$/m.test(frontMatter)) {
                frontMatter = frontMatter.replace(/^title:\s*.*$/m, `title: ${title}`);
            } else {
                // If title doesn't exist, append it (unlikely in valid Hugo front matter but good for safety)
                frontMatter = frontMatter.replace(/^---\s*\r?\n/, (match) => `${match}title: ${title}\n`);
            }
        }

        if (linkTitle !== undefined) {
            if (/^linkTitle:\s*.*$/m.test(frontMatter)) {
                frontMatter = frontMatter.replace(/^linkTitle:\s*.*$/m, `linkTitle: ${linkTitle}`);
            } else {
                // If linkTitle doesn't exist, insert it after title or at the beginning
                if (/^title:\s*.*$/m.test(frontMatter)) {
                    frontMatter = frontMatter.replace(/^(title:\s*.*$)/m, `$1\nlinkTitle: ${linkTitle}`);
                } else {
                    frontMatter = frontMatter.replace(/^---\s*\r?\n/, (match) => `${match}linkTitle: ${linkTitle}\n`);
                }
            }
        }

    } else {
        frontMatter = buildDefaultHomeFrontMatter(dateStr, { description, title, linkTitle });
    }

    const summaryLines = stripFrontMatter(dailyContent)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^>\s+/.test(line))
        .slice(0, 3)
        .map((line) => line.replace(/^>\s+/, ''));
    const summary = summaryLines.length
        ? summaryLines.map((line) => `> ${line}`).join('\n')
        : '> 最新一期已经完成来源、证据强弱与应用距离审查。';
    const body = `## 最新一期：${dateStr}\n\n${summary}\n\n[阅读 ${dateStr} 完整日报 →](${nextPath}/)\n\n## 本站如何审阅证据\n\n每条信息先说明发生了什么，再解释现实意义、不能得出的结论和距离实际应用的阶段。预印本、动物、体外、观察性和小样本研究会明确标注，不作为个人医疗建议。\n\n历史内容请使用左侧月份目录或站内搜索。`;
    return frontMatter.trimEnd() + '\n\n' + body;
}
