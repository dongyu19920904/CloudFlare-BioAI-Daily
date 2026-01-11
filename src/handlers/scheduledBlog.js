// src/handlers/scheduledBlog.js
// 博客自动生成任务 - 完全独立，不影响 BioAI 日报

import { getISODate, removeMarkdownCodeBlock } from '../helpers.js';
import { callChatAPIStream } from '../chatapi.js';
import { createOrUpdateGitHubFile, getGitHubFileSha, callGitHubApi } from '../github.js';
import { getBlogPrompt } from '../prompt/blogPrompt.js';

/**
 * 获取昨天的日期 (YYYY-MM-DD)
 */
function getYesterdayDate() {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    return today.toISOString().split('T')[0];
}

/**
 * 从 GitHub Raw URL 获取日报内容
 */
async function fetchDailyContent(repoOwner, repoName, dateStr) {
    const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/daily/${dateStr}.md`;
    console.log(`[ScheduledBlog] Fetching: ${rawUrl}`);
    
    try {
        const response = await fetch(rawUrl, {
            headers: { 'User-Agent': 'Cloudflare-Worker-BlogBot/1.0' }
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

/**
 * 构建 AstroPaper 格式的 Frontmatter
 */
function buildAstroPaperFrontMatter(title, description, dateStr, tags) {
    // 生成北京时间 09:00 的 ISO 时间戳
    const pubDatetime = `${dateStr}T01:00:00.000Z`; // UTC 01:00 = 北京 09:00
    
    return `---
title: "${title}"
pubDatetime: ${pubDatetime}
modDatetime: ${pubDatetime}
description: "${description}"
tags:
${tags.map(tag => `  - ${tag}`).join('\n')}
draft: false
---

`;
}

/**
 * 调用 AI 改写日报为博客风格
 * 返回 { title, body } 对象，AI 同时生成标题和正文
 */
async function generateBlogContent(env, dailyContent, blogType, dateStr) {
    const systemPrompt = getBlogPrompt(blogType);
    
    // 触发式写作提示词 - 让 AI 成为 yuyu 本人
    const userPrompt = `今天是 ${dateStr}，我刚看完今天的日报，准备写一篇博客。

**写作前先问自己**：
1. 哪条新闻让我想起了自己的某个经历？（卖账号、用工具、踩坑...）
2. 哪条让我困惑或者不同意？
3. ${blogType === 'bioai-daily' ? '哪条和我的"长生不老"目标有关？' : '这对我卖账号的生意有什么影响？'}
4. 今天有没有什么和日报无关但想说的？

**输出格式**：
- 第一行：博客标题（不要加 # 符号，不要加引号，要有个人感觉）
- 第二行：留空
- 第三行起：正文（Markdown 格式）

**标题示例**：
- ✅ "Cursor 又更新了，我的换号器要调整了"
- ✅ "今天的日报让我想起去年闲鱼被封的事"
- ✅ "这篇论文我没看懂，但感觉很重要"
- ❌ "AI 日报精选 | 2026/01/10"

**记住**：
- 日报只是触发器，≤30% 讨论日报，≥70% 是我自己的想法
- 可以跑题、可以吐槽、可以说"我不懂"
- 不用每篇都有"惊人观点"，真实比深刻重要

---

**今日日报内容**：

${dailyContent}`;
    
    let output = "";
    for await (const chunk of callChatAPIStream(env, userPrompt, systemPrompt)) {
        output += chunk;
    }
    
    const cleanedOutput = removeMarkdownCodeBlock(output).trim();
    
    // 解析标题和正文
    const lines = cleanedOutput.split('\n');
    let title = lines[0].replace(/^#*\s*/, '').replace(/["""]/g, '').trim();
    
    // 找到正文开始位置（跳过空行）
    let bodyStartIndex = 1;
    while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === '') {
        bodyStartIndex++;
    }
    const body = lines.slice(bodyStartIndex).join('\n').trim();
    
    // 如果标题太长、太短或像是正文，使用默认标题
    if (title.length > 60 || title.length < 5 || title.startsWith('今天') || title.includes('日报')) {
        title = blogType === 'ai-daily' 
            ? `AI 观察 | ${dateStr.replace(/-/g, '/')}`
            : `BioAI 观察 | ${dateStr.replace(/-/g, '/')}`;
    }
    
    return { title, body };
}

/**
 * 推送博客文件到 astro-paper 仓库
 */
async function pushBlogToGitHub(env, filePath, content, commitMessage) {
    // 临时切换到博客仓库配置
    const originalRepoName = env.GITHUB_REPO_NAME;
    const originalBranch = env.GITHUB_BRANCH;
    
    try {
        // 使用博客仓库配置
        env.GITHUB_REPO_NAME = env.BLOG_REPO_NAME || 'astro-paper';
        env.GITHUB_BRANCH = env.BLOG_REPO_BRANCH || 'main';
        
        const existingSha = await getGitHubFileSha(env, filePath);
        await createOrUpdateGitHubFile(env, filePath, content, commitMessage, existingSha);
        
        console.log(`[ScheduledBlog] Successfully pushed: ${filePath}`);
    } finally {
        // 恢复原配置
        env.GITHUB_REPO_NAME = originalRepoName;
        env.GITHUB_BRANCH = originalBranch;
    }
}

/**
 * 生成单篇博客（优化版：AI 生成标题）
 */
async function generateSingleBlog(env, dateStr, dailyContent, blogType, config) {
    const { tags, filePrefix, repoDesc } = config;
    
    console.log(`[ScheduledBlog] Generating ${blogType} blog for ${dateStr}...`);
    
    // 1. AI 改写（现在返回 title 和 body）
    const { title, body: blogBody } = await generateBlogContent(env, dailyContent, blogType, dateStr);
    
    // 2. 从 AI 输出中提取摘要（取第一段，清理格式）
    const firstParagraph = blogBody.split('\n\n')[0] || '';
    const cleanDescription = firstParagraph
        .replace(/[#*`\[\]]/g, '')  // 移除 Markdown 符号
        .replace(/!\[.*?\]\(.*?\)/g, '')  // 移除图片标记
        .replace(/\(https?:\/\/[^\)]+\)/g, '')  // 移除链接
        .replace(/\s+/g, ' ')  // 合并空白
        .trim();
    const description = cleanDescription.substring(0, 120) + (cleanDescription.length > 120 ? '...' : '');
    
    // 3. 构建完整文章
    const frontMatter = buildAstroPaperFrontMatter(title, description, dateStr, tags);
    const fullContent = frontMatter + blogBody + `\n\n---\n\n> 📰 完整版日报请看 [${repoDesc}](${config.sourceUrl})\n`;
    
    // 4. 推送到 GitHub
    const filePath = `src/data/blog/${filePrefix}-${dateStr}.md`;
    const commitMessage = `Auto-generate ${blogType} blog for ${dateStr}`;
    
    await pushBlogToGitHub(env, filePath, fullContent, commitMessage);
    
    return { filePath, title };
}

/**
 * 主入口：定时任务处理器
 */
export async function handleScheduledBlog(event, env, ctx, specifiedDate = null) {
    const dateStr = specifiedDate || getYesterdayDate();
    console.log(`[ScheduledBlog] Starting blog generation for ${dateStr}`);
    
    const results = [];
    
    try {
        // ========== 1. AI 日报 → 博客 ==========
        const aiDailyContent = await fetchDailyContent(
            env.GITHUB_REPO_OWNER,
            'Hextra-AI-Insight-Daily',
            dateStr
        );
        
        if (aiDailyContent) {
            const result = await generateSingleBlog(env, dateStr, aiDailyContent, 'ai-daily', {
                tags: ['ai-daily', 'ai'],
                filePrefix: 'ai-daily',
                repoDesc: '爱窝啦 AI 日报',
                sourceUrl: `https://news.aivora.cn/${dateStr.substring(0, 7)}/${dateStr}/`
            });
            results.push({ type: 'ai-daily', ...result, status: 'success' });
        } else {
            console.warn(`[ScheduledBlog] Skipped AI daily - content not found`);
            results.push({ type: 'ai-daily', status: 'skipped', reason: 'content not found' });
        }
        
        // ========== 2. BioAI 日报 → 博客 ==========
        const bioaiDailyContent = await fetchDailyContent(
            env.GITHUB_REPO_OWNER,
            'BioAI-Daily-Web',
            dateStr
        );
        
        if (bioaiDailyContent) {
            const result = await generateSingleBlog(env, dateStr, bioaiDailyContent, 'bioai-daily', {
                tags: ['bioai-daily', 'ai', 'biotech'],
                filePrefix: 'bioai-daily',
                repoDesc: 'BioAI 生命科学日报',
                sourceUrl: `https://news.aibioo.cn/${dateStr.substring(0, 7)}/${dateStr}/`
            });
            results.push({ type: 'bioai-daily', ...result, status: 'success' });
        } else {
            console.warn(`[ScheduledBlog] Skipped BioAI daily - content not found`);
            results.push({ type: 'bioai-daily', status: 'skipped', reason: 'content not found' });
        }
        
        console.log(`[ScheduledBlog] Completed! Results:`, JSON.stringify(results));
        return { success: true, date: dateStr, results };
        
    } catch (error) {
        console.error(`[ScheduledBlog] Error:`, error);
        return { success: false, date: dateStr, error: error.message, results };
    }
}
