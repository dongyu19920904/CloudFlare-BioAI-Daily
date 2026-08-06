// src/handlers/scheduledBlog.js
// Personal blog generation is isolated from the BioAI daily cron jobs.

import { getISODate, removeMarkdownCodeBlock } from '../helpers.js';
import { callChatAPIStream } from '../chatapi.js';
import { createOrUpdateGitHubFile, getGitHubFileSha } from '../github.js';
import { getBlogPrompt } from '../prompt/blogPrompt.js';
import {
    deriveBlogDescription,
    extractUrls,
    normalizeGeneratedMarkdown,
    qualifyDailyForPersonalBlog,
    validateBlogDraft,
} from '../blogQuality.js';
import { buildAstroPaperFrontMatter } from '../utils/frontmatter.js';
import { resolveBlogDate } from '../utils/blogDate.js';

async function fetchDailyContent(repoOwner, repoName, dateStr) {
    const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/daily/${dateStr}.md`;
    console.log(`[ScheduledBlog] Fetching: ${rawUrl}`);

    try {
        const response = await fetch(rawUrl, {
            headers: { 'User-Agent': 'Cloudflare-Worker-BlogBot/1.0' },
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`[ScheduledBlog] Daily not found: ${rawUrl}`);
                return null;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();
    } catch (error) {
        console.error(`[ScheduledBlog] Fetch error for ${rawUrl}:`, error);
        return null;
    }
}

function parseBlogOutput(output, blogType, dateStr) {
    const cleanedOutput = removeMarkdownCodeBlock(output).trim();
    const lines = cleanedOutput.split('\n');
    let title = (lines[0] || '').replace(/^#*\s*/, '').replace(/["""]/g, '').trim();

    let bodyStartIndex = 1;
    while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === '') {
        bodyStartIndex++;
    }

    const body = lines.slice(bodyStartIndex).join('\n').trim();
    if (title.length > 34 || title.length < 6 || /^(今天|日报)/.test(title)) {
        title = blogType === 'ai-daily'
            ? `AI 工具这一轮变化，我先记一笔 ${dateStr.replace(/-/g, '/')}`
            : `BioAI 这条线，我先记一笔 ${dateStr.replace(/-/g, '/')}`;
    }

    return { title, body };
}

async function streamChat(env, userPrompt, systemPrompt) {
    let output = '';
    for await (const chunk of callChatAPIStream(env, userPrompt, systemPrompt)) {
        output += chunk;
    }
    return output;
}

function buildUserPrompt({ dateStr, dailyContent, blogType, signals }) {
    const signalList = signals.map((signal, index) => `${index + 1}. ${signal}`).join('\n');
    const blogFocus = blogType === 'bioai-daily'
        ? 'AI 生命延续学、普通人能不能用、内容/项目/硬件机会'
        : 'AI 账号店、AI 一人公司、客服自动化、工具上新和用户理解成本';

    return `日期：${dateStr}

请基于下方“可用触发材料”写一篇 yuyu 的个人博客。写作重点是：${blogFocus}。

关键边界：
- 不能编造 yuyu 今天遇到的客户、订单、供应商、微信聊天、退款、补货或大理生活细节。
- 可以使用长期背景：爱窝啦 AI 账号店、AI 一人公司、客服/售后压力、AI 生命延续学长期方向。
- 如果要写第一人称经历，只能写成长期状态或已知背景，不要写成今天刚发生的具体事件。
- 不要输出 Table of contents。
- 只保留与正文直接相关的原始来源链接；不要把网页链接当图片。

输出格式：
第一行：标题，12-28 个字，不加 #，不要以“今天/日报/AI 日报/BioAI 观察”开头。
第二行：留空。
第三行起：正文 Markdown，800-1200 字。

可用触发材料：
${signalList}

完整日报原文（只用于事实核对和保留来源链接，不要整篇复写）：

${dailyContent}`;
}

async function generateBlogContent(env, dailyContent, blogType, dateStr, signals) {
    const systemPrompt = getBlogPrompt(blogType);
    const userPrompt = buildUserPrompt({ dateStr, dailyContent, blogType, signals });
    const output = await streamChat(env, userPrompt, systemPrompt);
    return parseBlogOutput(output, blogType, dateStr);
}

async function repairBlogDraft(env, draft, context) {
    const systemPrompt = getBlogPrompt(context.blogType);
    const userPrompt = `下面这篇草稿没有通过发布校验。只修复列出的问题，不重写无关内容，不增加新的事实，不编造 yuyu 今天的第一手经历。

必须修复的问题：
${context.severe.map(item => `- ${item}`).join('\n')}

修复规则：
- 如果缺少个人材料，只能加入“长期背景/当前状态”里的真实信息，例如爱窝啦 AI 账号店、客服售后压力、AI 一人公司、AI 生命延续学，不要写成今天刚发生。
- 如果图片或链接有问题，删除或改成正文链接；不要新增来源外链接。
- 如果长句过重，只拆句和调整节奏，不改变观点。
- 不输出 Table of contents。

输出格式仍然是：
第一行：标题
第二行：留空
第三行起：正文 Markdown

原始触发材料：
${context.signals.map((signal, index) => `${index + 1}. ${signal}`).join('\n')}

原草稿标题：
${draft.title}

原草稿正文：
${draft.body}`;

    const output = await streamChat(env, userPrompt, systemPrompt);
    return parseBlogOutput(output, context.blogType, context.dateStr);
}

async function pushBlogToGitHub(env, filePath, content, commitMessage) {
    const originalRepoName = env.GITHUB_REPO_NAME;
    const originalBranch = env.GITHUB_BRANCH;

    try {
        env.GITHUB_REPO_NAME = env.BLOG_REPO_NAME || 'astro-paper';
        env.GITHUB_BRANCH = env.BLOG_REPO_BRANCH || 'main';

        const existingSha = await getGitHubFileSha(env, filePath);
        await createOrUpdateGitHubFile(env, filePath, content, commitMessage, existingSha);

        console.log(`[ScheduledBlog] Successfully pushed: ${filePath}`);
    } finally {
        env.GITHUB_REPO_NAME = originalRepoName;
        env.GITHUB_BRANCH = originalBranch;
    }
}

export function getBlogJobConfigs(dateStr) {
    return [
        {
            type: 'ai-daily',
            repoName: 'Hextra-AI-Insight-Daily',
            tags: ['ai-daily', 'ai'],
            filePrefix: 'ai-daily',
            repoDesc: '爱窝啦 AI 日报',
            sourceUrl: `https://news.aivora.cn/${dateStr.substring(0, 7)}/${dateStr}/`,
        },
        {
            type: 'bioai-daily',
            repoName: 'BioAI-Daily-Web',
            tags: ['bioai-daily', 'ai', 'biotech'],
            filePrefix: 'bioai-daily',
            repoDesc: 'BioAI 生命科学日报',
            sourceUrl: `https://news.aibioo.cn/${dateStr.substring(0, 7)}/${dateStr}/`,
        },
    ];
}

async function generateSingleBlog(env, dateStr, dailyContent, config) {
    console.log(`[ScheduledBlog] Generating ${config.type} blog for ${dateStr}...`);

    const qualification = qualifyDailyForPersonalBlog(dailyContent, config.type);
    if (!qualification.eligible) {
        return {
            status: 'skipped',
            reason: qualification.reason,
            signals: qualification.signals,
        };
    }

    const allowedUrls = [...extractUrls(dailyContent), config.sourceUrl];
    let draft = await generateBlogContent(env, dailyContent, config.type, dateStr, qualification.signals);
    draft.body = normalizeGeneratedMarkdown(draft.body, allowedUrls);

    let validation = validateBlogDraft({
        title: draft.title,
        body: draft.body,
        dailyContent,
        blogType: config.type,
        allowedUrls,
    });

    if (!validation.ok) {
        console.warn(`[ScheduledBlog] ${config.type} draft needs targeted repair: ${validation.severe.join('; ')}`);
        draft = await repairBlogDraft(env, draft, {
            dateStr,
            dailyContent,
            blogType: config.type,
            signals: qualification.signals,
            severe: validation.severe,
        });
        draft.body = normalizeGeneratedMarkdown(draft.body, allowedUrls);
        validation = validateBlogDraft({
            title: draft.title,
            body: draft.body,
            dailyContent,
            blogType: config.type,
            allowedUrls,
        });
    }

    if (!validation.ok) {
        return {
            status: 'skipped',
            reason: `draft failed quality gate: ${validation.severe.join('; ')}`,
            warnings: validation.warnings,
            signals: qualification.signals,
        };
    }

    const description = deriveBlogDescription(draft.body, draft.title);
    const frontMatter = buildAstroPaperFrontMatter(draft.title, description, dateStr, config.tags);
    const fullContent = frontMatter + draft.body + `\n\n---\n\n> 完整版日报请看 [${config.repoDesc}](${config.sourceUrl})\n`;
    const filePath = `src/data/blog/${config.filePrefix}-${dateStr}.md`;
    const commitMessage = `Auto-generate ${config.type} blog for ${dateStr}`;

    await pushBlogToGitHub(env, filePath, fullContent, commitMessage);

    return {
        status: 'success',
        filePath,
        title: draft.title,
        warnings: validation.warnings,
        signals: qualification.signals,
    };
}

async function writeBlogStatus(env, dateStr, result) {
    if (!env.DATA_KV || typeof env.DATA_KV.put !== 'function') return;

    try {
        await env.DATA_KV.put(
            `personal-blog-status:${dateStr}`,
            JSON.stringify({
                ...result,
                updatedAt: new Date().toISOString(),
            }),
            { expirationTtl: 60 * 60 * 24 * 45 }
        );
    } catch (error) {
        console.warn(`[ScheduledBlog] Failed to write blog status: ${error.message}`);
    }
}

export function summarizeBlogResults(results) {
    const successCount = results.filter(result => result.status === 'success').length;
    const failedCount = results.filter(result => result.status === 'failed').length;
    const skippedCount = results.filter(result => result.status === 'skipped').length;

    return {
        success: failedCount === 0 || successCount > 0 || skippedCount === results.length,
        successCount,
        failedCount,
        skippedCount,
    };
}

export async function handleScheduledBlog(event, env, ctx, specifiedDate = null) {
    const dateStr = resolveBlogDate(specifiedDate, getISODate());
    console.log(`[ScheduledBlog] Starting blog generation for ${dateStr}`);

    const results = [];
    for (const config of getBlogJobConfigs(dateStr)) {
        try {
            const dailyContent = await fetchDailyContent(
                env.GITHUB_REPO_OWNER,
                config.repoName,
                dateStr
            );

            if (!dailyContent) {
                results.push({
                    type: config.type,
                    status: 'skipped',
                    reason: 'content not found',
                });
                continue;
            }

            const result = await generateSingleBlog(env, dateStr, dailyContent, config);
            results.push({ type: config.type, ...result });
        } catch (error) {
            console.error(`[ScheduledBlog] ${config.type} failed:`, error);
            results.push({
                type: config.type,
                status: 'failed',
                error: error.message,
            });
        }
    }

    const summary = summarizeBlogResults(results);
    const result = { ...summary, date: dateStr, results };
    await writeBlogStatus(env, dateStr, result);

    console.log(`[ScheduledBlog] Completed:`, JSON.stringify(result));
    return result;
}
