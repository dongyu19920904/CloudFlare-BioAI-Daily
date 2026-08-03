const DEFAULT_DAILY_DESCRIPTION = '每日精选 AI 与衰老科学、健康寿命、生物年龄和相关研究工具的重要信号，说明证据强弱、研究边界与距离实际应用还有多远。';

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
linkTitle: ${JSON.stringify(`${monthDay}-日报`)}
title: ${JSON.stringify(resolvedTitle)}
weight: ${weight}
breadcrumbs: false
comments: true
date: ${dateStr}T00:00:00+08:00
lastmod: ${dateStr}T00:00:00+08:00
author: "AI 生命延续学编辑部"
editor: "AI 生命延续学编辑部"
description: ${JSON.stringify(description)}
keywords:
  - AI生命延续学
  - 衰老研究
  - 生物年龄
  - 证据分级
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
        linkTitle = 'AI 生命延续学日报'
    } = options;
    const nextPath = `/${getYearMonth(dateStr)}/${dateStr}`;
    const resolvedTitle = title === undefined ? linkTitle : title;
    return `---
linkTitle: ${JSON.stringify(linkTitle)}
title: ${JSON.stringify(resolvedTitle)}
breadcrumbs: false
layout: home
type: home
next: ${nextPath}
description: ${JSON.stringify(description)}
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

    const body = `## 今天值得知道什么

这里不追求塞满资讯。每期只保留最值得跟踪的 5–8 个信号；当可靠来源不足时，宁可少发，也不以二手转述和推测凑数。

{{< latest-daily >}}

## 如何阅读证据等级

- **高**：通常来自质量较高的一手人体研究或系统证据，仍不等于医疗建议。
- **中**：有人体数据或较完整验证，但研究设计、样本或外部验证仍有限。
- **初步**：预印本、动物/细胞研究、项目演示、新闻稿或信息不完整的线索。

## 历史日报

可通过左侧月份目录或站内搜索查找历史日报、论文标题、项目名和中英文关键词。`;
    return frontMatter.trimEnd() + '\n\n' + body.trimStart() + '\n';
}
