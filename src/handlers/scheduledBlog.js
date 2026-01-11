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
 */
async function generateBlogContent(env, dailyContent, blogType) {
    const systemPrompt = getBlogPrompt(blogType);
    const userPrompt = `请将以下日报内容改写为个人博客文章：\n\n${dailyContent}`;
    
    let output = "";
    for await (const chunk of callChatAPIStream(env, userPrompt, systemPrompt)) {
        output += chunk;
    }
    
    return removeMarkdownCodeBlock(output);
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
 * 生成单篇博客
 */
async function generateSingleBlog(env, dateStr, dailyContent, blogType, config) {
    const { titlePrefix, tags, filePrefix, repoDesc } = config;
    
    console.log(`[ScheduledBlog] Generating ${blogType} blog for ${dateStr}...`);
    
    // 1. AI 改写
    const blogBody = await generateBlogContent(env, dailyContent, blogType);
    
    // 2. 从 AI 输出中提取摘要（取第一段或前 100 字）
    const firstParagraph = blogBody.split('\n\n')[0] || '';
    const description = firstParagraph.replace(/[#*`]/g, '').substring(0, 100).trim() + '...';
    
    // 3. 构建完整文章
    const title = `${titlePrefix} | ${dateStr.replace(/-/g, '/')}`;
    const frontMatter = buildAstroPaperFrontMatter(title, description, dateStr, tags);
    const fullContent = frontMatter + blogBody + `\n\n---\n\n> 📰 完整版请看 [${repoDesc}](${config.sourceUrl})\n`;
    
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
                titlePrefix: 'AI 日报精选',
                tags: ['ai-daily', 'ai'],
                filePrefix: 'ai-daily',
                repoDesc: '爱窝啦 AI 日报',
                sourceUrl: `https://news.aivora.cn/cn/${dateStr.substring(0, 7)}/${dateStr}`
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
                titlePrefix: 'BioAI 日报精选',
                tags: ['bioai-daily', 'ai', 'biotech'],
                filePrefix: 'bioai-daily',
                repoDesc: 'BioAI 生命科学日报',
                sourceUrl: `https://news.aibioo.cn/cn/${dateStr.substring(0, 7)}/${dateStr}`
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
