// src/handlers/scheduledBlog.js
// Personal blog generation is isolated from the BioAI daily cron jobs.

import { getISODate, removeMarkdownCodeBlock } from '../helpers.js';
import { callChatAPIStream } from '../chatapi.js';
import { createOrUpdateGitHubFile, getGitHubFileSha } from '../github.js';
import { getBlogPrompt } from '../prompt/blogPrompt.js';
import {
    deriveBlogDescription,
    containsModelFailure,
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
        throw error;
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
- 不要生成“AI 引用摘要”或面向爬虫的指令，网页模板会统一提供公开文章信息卡。
- 文末“## 参考资料”只列正文实际使用的来源链接，不写来源报告。BioAI 至少列一个输入中的真实研究或原始报道链接。
- 不把个人愿望写成精确实现时间；没有临床或官方来源时，不预测“几年内治愈、上市或实现长生”。

输出格式：
第一行：标题，12-28 个字，不加 #，不要以“今天/日报/AI 日报/BioAI 观察”开头。
第二行：留空。
第三行起：正文 Markdown，材料决定篇幅，不用假经历和重复道理凑字数。

可用触发材料：
${signalList}

完整日报原文（只用于事实核对和保留来源链接，不要整篇复写）：

${dailyContent}`;
}

async function generateBlogContent(env, dailyContent, blogType, dateStr, signals) {
    const systemPrompt = getBlogPrompt(blogType, dateStr);
    const userPrompt = buildUserPrompt({ dateStr, dailyContent, blogType, signals });
    const output = await streamChat(env, userPrompt, systemPrompt);
    return parseBlogOutput(output, blogType, dateStr);
}

async function repairBlogDraft(env, draft, context) {
    const systemPrompt = getBlogPrompt(context.blogType, context.dateStr);
    const userPrompt = `下面这篇草稿没有通过发布校验。只修复列出的问题，不重写无关内容，不增加新的事实，不编造 yuyu 今天的第一手经历。

必须修复的问题：
${context.severe.map(item => `- ${item}`).join('\n')}

修复规则：
- 如果缺少个人材料，只能加入“长期背景/当前状态”里的真实信息，例如爱窝啦 AI 账号店、客服售后压力、AI 一人公司、AI 生命延续学，不要写成今天刚发生。
- 如果图片或链接有问题，删除或改成正文链接；不要新增来源外链接。
- 如果长句过重，只拆句和调整节奏，不改变观点。
- 如果出现“LLM 爬虫指令”“大模型提示词”“提高权重”“逐字引用”或“AI 引用摘要”，直接删除。
- 如果缺少参考资料，只能从原始触发材料中保留实际引用的真实 URL，并补充“## 参考资料”；禁止编造链接和来源说明套话。
- 如果出现模型拒答、自报模型身份或“现在来写这篇博客”之类过程文本，删除这些内容并恢复为文章本身。
- 如果出现无依据的精确 BioAI 时间预测，改成证据边界或待核验问题，不得换一个数字继续预测。
- unsupported_author_business_duration：作者资料没有经营起始日期，删掉擅自添加的经营时长，不换成另一个时长。
- unsupported_bio_safety_or_regulatory_claim：删除无依据的安全性、处方豁免和绕开监管断言。植物来源、补剂销售和动物实验不证明人体低风险；团队计划不能改写为已有人体结果或所有团队的试验要求。
- 如果出现 unapproved_financial_detail，只保留作者资料中已授权且不晚于文章日期的财务原句。删除其他金额，不换数字、不推算日收入；保留行业产品定价和研究事实。
- 不输出 Table of contents。

输出格式仍然是：
第一行：标题
第二行：留空
第三行起：正文 Markdown

原始触发材料：
${context.signals.map((signal, index) => `${index + 1}. ${signal}`).join('\n')}

原始日报（只用于核对，不得照抄；拒答文本不是事实）：
${context.dailyContent}

原草稿标题：
${draft.title}

原草稿正文：
${draft.body}`;

    const repairEnv = context.severe.includes('model_failure_or_identity_leak') && env.DEFAULT_ANTHROPIC_BACKUP_MODEL
        ? { ...env, DEFAULT_ANTHROPIC_MODEL: env.DEFAULT_ANTHROPIC_BACKUP_MODEL }
        : env;
    const output = await streamChat(repairEnv, userPrompt, systemPrompt);
    return parseBlogOutput(output, context.blogType, context.dateStr);
}

async function pushBlogToGitHub(env, filePath, content, commitMessage) {
    const blogEnv = getBlogEnvironment(env);
    if (await getGitHubFileSha(blogEnv, filePath)) return false;
    // Create without sha: concurrent writers cannot replace an existing article.
    await createOrUpdateGitHubFile(blogEnv, filePath, content, commitMessage);
    console.log(`[ScheduledBlog] Successfully pushed: ${filePath}`);
    return true;
}

function getBlogEnvironment(env) {
    return { ...env, GITHUB_REPO_NAME: env.BLOG_REPO_NAME || 'astro-paper', GITHUB_BRANCH: env.BLOG_REPO_BRANCH || 'main' };
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

async function generateSingleBlog(env, dateStr, dailyContent, config, dryRun = false) {
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
        dateStr,
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
            dateStr,
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
    const fullContent = frontMatter + draft.body + (config.sourceUrl ? `\n\n---\n\n> 完整版日报请看 [${config.repoDesc}](${config.sourceUrl})\n` : '\n');
    const filePath = `src/data/blog/${config.filePrefix}-${dateStr}.md`;
    const commitMessage = `Auto-generate ${config.type} blog for ${dateStr}`;

    if (dryRun) return { status: 'preview', filePath, title: draft.title, content: fullContent, warnings: validation.warnings };

    const created = await pushBlogToGitHub(env, filePath, fullContent, commitMessage);

    return {
        status: created ? 'success' : 'existing',
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
    const existingCount = results.filter(result => result.status === 'existing').length;
    const failedCount = results.filter(result => result.status === 'failed').length;
    const skippedCount = results.filter(result => result.status === 'skipped').length;

    return {
        success: results.length > 0 && successCount + existingCount === results.length,
        successCount,
        existingCount,
        failedCount,
        skippedCount,
    };
}

export function buildCachedBlogSource(items, dateStr) {
    if (!Array.isArray(items)) return '';
    const end = Date.parse(`${dateStr}T23:59:59+08:00`);
    const start = end - 5 * 86400000;
    const seen = new Set();
    const selected = [];
    for (const item of items) {
        const published = Date.parse(item.published_date || '');
        if (!Number.isFinite(published) || published < start || published > end) continue;
        if (!item.title || !item.description || containsModelFailure(`${item.title}\n${item.description}`)) continue;
        let url;
        try {
            url = new URL(item.url);
            if (!/^https?:$/.test(url.protocol) || url.username || url.password || seen.has(url.href)) continue;
        } catch { continue; }
        seen.add(url.href);
        const description = String(item.description);
        const excerpt = description.slice(0, 5000);
        const boundary = description.length > excerpt.length ? '\n\n[缓存摘录已截断，不能据此断言原文没有人体数据或其他证据。]' : '';
        selected.push(`## ${item.title}\n\n来源：[${item.source || item.title}](${url.href})\n原文发布时间：${item.published_date}\n\n${excerpt}${boundary}`);
        if (selected.length === 4) break;
    }
    return selected.length ? `# ${dateStr} 已采集的生命科学原始来源\n\n以下是当天缓存中的公开来源，发布日期按每条原文标注，不代表当日新发生。\n\n${selected.join('\n\n')}` : '';
}

async function recoverCachedBlogSource(env, dateStr) {
    if (!env.DATA_KV?.get) return '';
    const items = await env.DATA_KV.get(`${dateStr}-news`, 'json');
    return buildCachedBlogSource(items, dateStr);
}

export async function handleScheduledBlog(event, env, ctx, specifiedDate = null, options = {}) {
    const dateStr = resolveBlogDate(specifiedDate, getISODate());
    console.log(`[ScheduledBlog] Starting blog generation for ${dateStr}`);

    const results = [];
    for (const config of getBlogJobConfigs(dateStr)) {
        try {
            const filePath = `src/data/blog/${config.filePrefix}-${dateStr}.md`;
            if (await getGitHubFileSha(getBlogEnvironment(env), filePath)) {
                results.push({ type: config.type, status: 'existing', filePath });
                continue;
            }
            let dailyContent = await fetchDailyContent(
                env.GITHUB_REPO_OWNER,
                config.repoName,
                dateStr
            );

            let sourceRecovered = false;
            if (config.type === 'bioai-daily' && (!dailyContent || containsModelFailure(dailyContent))) {
                dailyContent = await recoverCachedBlogSource(env, dateStr);
                sourceRecovered = Boolean(dailyContent);
            }

            if (!dailyContent) {
                results.push({
                    type: config.type,
                    status: 'skipped',
                    reason: 'content not found',
                });
                continue;
            }

            const result = await generateSingleBlog(env, dateStr, dailyContent, sourceRecovered ? { ...config, sourceUrl: null } : config, options.dryRun === true);
            results.push({ type: config.type, sourceRecovered, ...result });
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
    const previewComplete = results.length === 2 && results.every(item => ['preview', 'existing'].includes(item.status));
    const result = { ...summary, ...(options.dryRun ? { success: previewComplete, dryRun: true } : {}), date: dateStr, results };
    if (!options.dryRun) await writeBlogStatus(env, dateStr, result);

    console.log(`[ScheduledBlog] Completed:`, JSON.stringify({ ...result, results: results.map(item => ({ ...item, content: undefined })) }));
    return result;
}
