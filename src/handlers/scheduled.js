import { getISODate, formatDateToChinese, removeMarkdownCodeBlock, stripHtml, convertPlaceholdersToMarkdownImages, setFetchDate, hasMedia, replaceIncorrectDomainLinks, normalizeDailyBody } from '../helpers.js';
import { fetchAllData, dataSources } from '../dataFetchers.js';
import { storeInKV, getFromKV } from '../kv.js';
import { callChatAPI, callChatAPIStream } from '../chatapi.js';
import { getSystemPromptSummarizationStepOne } from "../prompt/summarizationPromptStepZero";
import { getSystemPromptSummarizationStepThree } from "../prompt/summarizationPromptStepThree";
import { getSystemPromptBioOpportunity } from "../prompt/bioOpportunityPrompt.js";
import { getSystemPromptBioProjectOpportunity } from "../prompt/bioProjectOpportunityPrompt.js";
import { insertFoot } from '../foot.js';
import { insertAd, insertMidAd } from '../ad.js';
import { buildDailyContentWithFrontMatter, getYearMonth, updateHomeIndexContent, buildMonthDirectoryIndex } from '../contentUtils.js';
import { resolveDailyPromptItemCap, selectDailyPromptItems } from '../dailyPromptSelection.js';
import {
    DEFAULT_BIO_OPPORTUNITY_DESCRIPTION,
    DEFAULT_BIO_PROJECT_OPPORTUNITY_DESCRIPTION,
    buildBioSectionPageContent,
    buildBioSectionPaths,
    updateBioSectionHomeIndexContent,
} from '../bioOpportunityUtils.js';
import { createOrUpdateGitHubFile, getGitHubFileContent, getGitHubFileSha } from '../github.js';

function normalizeSummaryLines(summaryText) {
    if (!summaryText) return '';
    const lines = String(summaryText)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length <= 3) return summaryText.trim();
    return lines.slice(-3).join('\n');
}

function shiftDate(dateStr, days) {
    const baseDate = new Date(`${dateStr}T00:00:00+08:00`);
    return getISODate(new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000));
}

async function backfillSparseCategoriesFromKv(env, dateStr, allUnifiedData) {
    const lookbackDays = Math.max(parseInt(env.FOLO_FILTER_DAYS || '3', 10), 1);
    const categories = ['news', 'paper', 'socialMedia'];
    let usedFallback = false;

    for (const category of categories) {
        if ((allUnifiedData[category] || []).length > 0) {
            continue;
        }

        for (let offset = 1; offset <= lookbackDays; offset += 1) {
            const previousDate = shiftDate(dateStr, -offset);
            const cachedItems = await getFromKV(env.DATA_KV, `${previousDate}-${category}`);
            if (Array.isArray(cachedItems) && cachedItems.length > 0) {
                allUnifiedData[category] = cachedItems;
                usedFallback = true;
                console.log(`[Scheduled] Backfilled ${category} from ${previousDate} (${cachedItems.length} items).`);
                break;
            }
        }
    }

    return usedFallback;
}

function parsePositiveInteger(value, defaultValue) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

async function resolveScheduledFoloCookie(env, logPrefix = '[Scheduled]') {
    let foloCookie = env.FOLO_COOKIE;
    if (!foloCookie && env.FOLO_COOKIE_KV_KEY) {
        try {
            foloCookie = await getFromKV(env.DATA_KV, env.FOLO_COOKIE_KV_KEY);
            if (foloCookie) console.log(`${logPrefix} Loaded Folo cookie from KV (${env.FOLO_COOKIE_KV_KEY}).`);
        } catch (err) {
            console.warn(`${logPrefix} Failed to load Folo cookie from KV: ${err.message}`);
        }
    }
    return foloCookie;
}

async function fetchAndCacheScheduledData(env, dateStr, logPrefix = '[Scheduled]') {
    console.log(`${logPrefix} Fetching data...`);
    const foloCookie = await resolveScheduledFoloCookie(env, logPrefix);
    const allUnifiedData = await fetchAllData(env, foloCookie);
    const usedFallback = await backfillSparseCategoriesFromKv(env, dateStr, allUnifiedData);
    const fetchPromises = [];

    for (const sourceType in dataSources) {
        if (Object.hasOwnProperty.call(dataSources, sourceType)) {
            fetchPromises.push(storeInKV(env.DATA_KV, `${dateStr}-${sourceType}`, allUnifiedData[sourceType] || []));
        }
    }

    await Promise.all(fetchPromises);
    console.log(`${logPrefix} Data fetched and stored.${usedFallback ? ' Used recent KV fallback.' : ''}`);
    return allUnifiedData;
}

function truncatePromptText(text, maxChars = 700) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars)}...`;
}

function formatOpportunityPromptItem(item, sourceType) {
    const contentText = truncatePromptText(stripHtml(item?.details?.content_html || ''), 700);
    const details = [];
    if (item?.details?.totalStars !== undefined && item?.details?.totalStars !== null) {
        details.push(`Stars: ${item.details.totalStars}`);
    }
    if (item?.details?.language) {
        details.push(`Language: ${item.details.language}`);
    }

    return [
        `Type: ${sourceType}`,
        `Title: ${item?.title || 'N/A'}`,
        `Published: ${item?.published_date || 'N/A'}`,
        `Source: ${item?.source || 'N/A'}`,
        `Url: ${item?.url || 'N/A'}`,
        item?.description ? `Description: ${truncatePromptText(item.description, 400)}` : '',
        details.length ? details.join('\n') : '',
        contentText ? `Content: ${contentText}` : '',
    ].filter(Boolean).join('\n');
}

function buildOpportunityPromptInput(allUnifiedData, sourceOrder, caps) {
    const selectedItems = [];

    for (const sourceType of sourceOrder) {
        const cap = caps[sourceType] || 0;
        const items = (allUnifiedData[sourceType] || []).slice(0, cap);
        for (const item of items) {
            selectedItems.push(formatOpportunityPromptItem(item, sourceType));
        }
    }

    return {
        selectedItems,
        promptInput: selectedItems.join('\n\n------\n\n'),
    };
}

async function generateBioOpportunityMarkdown(env, userPrompt, systemPrompt) {
    let output = '';
    try {
        for await (const chunk of callChatAPIStream(env, userPrompt, systemPrompt)) {
            output += chunk;
        }
    } catch (error) {
        const message = String(error?.message || error);
        if (!/(524|timeout|timed out|yielded no content)/i.test(message)) {
            throw error;
        }
        console.warn(`[Scheduled] Stream generation failed, retrying non-stream: ${message}`);
        output = await callChatAPI(env, userPrompt, systemPrompt);
    }

    output = removeMarkdownCodeBlock(output);
    output = convertPlaceholdersToMarkdownImages(output);
    output = replaceIncorrectDomainLinks(output, env.BOOK_LINK ? new URL(env.BOOK_LINK).hostname : 'news.aibioo.cn');
    return output.trim();
}

async function generateScheduledMarkdownWithFallback(env, userPrompt, systemPrompt, label) {
    let output = '';
    try {
        for await (const chunk of callChatAPIStream(env, userPrompt, systemPrompt)) {
            output += chunk;
        }
        return output;
    } catch (error) {
        const message = String(error?.message || error);
        if (!/(524|timeout|timed out|yielded no content|truncated|max_tokens)/i.test(message)) {
            throw error;
        }
        console.warn(`[Scheduled][${label}] Stream generation failed, retrying non-stream: ${message}`);
        return callChatAPI(env, userPrompt, systemPrompt);
    }
}

async function commitBioSectionOutputs(env, dateStr, section, markdownContent, options) {
    const paths = buildBioSectionPaths(dateStr, section);
    const pageContent = buildBioSectionPageContent(dateStr, markdownContent, {
        title: options.pageTitle,
        linkTitle: options.pageLinkTitle,
        description: options.description,
    });

    const existingPageSha = await getGitHubFileSha(env, paths.pagePath);
    await createOrUpdateGitHubFile(
        env,
        paths.pagePath,
        pageContent,
        `${existingPageSha ? 'Update' : 'Create'} ${section} page for ${dateStr} (Scheduled)`,
        existingPageSha
    );

    let existingHomeContent = '';
    try {
        existingHomeContent = await getGitHubFileContent(env, paths.homePath);
    } catch (error) {
        console.warn(`[Scheduled][${section}] Home page not found, will create a new one.`);
    }

    const homeContent = updateBioSectionHomeIndexContent(existingHomeContent, markdownContent, dateStr, {
        title: options.homeTitle,
        linkTitle: options.homeLinkTitle,
        description: options.description,
        sectionPrefix: `/${section}`,
    });
    const existingHomeSha = await getGitHubFileSha(env, paths.homePath);
    await createOrUpdateGitHubFile(
        env,
        paths.homePath,
        homeContent,
        `${existingHomeSha ? 'Update' : 'Create'} ${section} home page for ${dateStr} (Scheduled)`,
        existingHomeSha
    );

    return paths;
}

async function generateAndCommitOpportunity(env, dateStr, allUnifiedData) {
    const caps = {
        news: 5,
        paper: 4,
        project: 4,
        socialMedia: 3,
    };
    const { selectedItems, promptInput } = buildOpportunityPromptInput(
        allUnifiedData,
        ['news', 'paper', 'project', 'socialMedia'],
        caps
    );

    if (selectedItems.length === 0) {
        return { success: false, date: dateStr, reason: 'no_items' };
    }

    const markdownContent = await generateBioOpportunityMarkdown(
        env,
        `报告日期：${dateStr}\n\n素材如下：\n\n${promptInput}`,
        getSystemPromptBioOpportunity(dateStr)
    );
    const titleBase = env.OPPORTUNITY_TITLE || 'AI生命延续学商机日报';
    const paths = await commitBioSectionOutputs(env, dateStr, 'opportunity', markdownContent, {
        pageTitle: `${titleBase} ${formatDateToChinese(dateStr)}`,
        pageLinkTitle: `${dateStr.slice(5)}-商机`,
        homeTitle: titleBase,
        homeLinkTitle: '商机日报',
        description: DEFAULT_BIO_OPPORTUNITY_DESCRIPTION,
    });

    return { success: true, date: dateStr, selectedCount: selectedItems.length, paths };
}

async function generateAndCommitProjectOpportunity(env, dateStr, allUnifiedData) {
    const caps = {
        project: parsePositiveInteger(env.PROJECT_OPPORTUNITY_MAX_PROJECTS, 4),
        news: parsePositiveInteger(env.PROJECT_OPPORTUNITY_MAX_NEWS, 3),
        paper: parsePositiveInteger(env.PROJECT_OPPORTUNITY_MAX_PAPERS, 3),
        socialMedia: parsePositiveInteger(env.PROJECT_OPPORTUNITY_MAX_SOCIAL, 2),
    };
    const { selectedItems, promptInput } = buildOpportunityPromptInput(
        allUnifiedData,
        ['project', 'news', 'paper', 'socialMedia'],
        caps
    );

    if (selectedItems.length === 0) {
        return { success: false, date: dateStr, reason: 'no_items' };
    }

    const markdownContent = await generateBioOpportunityMarkdown(
        env,
        `报告日期：${dateStr}\n\n素材如下：\n\n${promptInput}`,
        getSystemPromptBioProjectOpportunity(dateStr)
    );
    const titleBase = env.PROJECT_OPPORTUNITY_TITLE || 'AI生命延续学资讯商机项目';
    const paths = await commitBioSectionOutputs(env, dateStr, 'project-opportunity', markdownContent, {
        pageTitle: `${titleBase} ${formatDateToChinese(dateStr)}`,
        pageLinkTitle: `${dateStr.slice(5)}-项目`,
        homeTitle: titleBase,
        homeLinkTitle: '项目商机',
        description: DEFAULT_BIO_PROJECT_OPPORTUNITY_DESCRIPTION,
    });

    return { success: true, date: dateStr, selectedCount: selectedItems.length, paths };
}

export async function handleScheduledOpportunity(event, env, ctx, specifiedDate = null, preloadedData = null) {
    const dateStr = specifiedDate || getISODate();
    setFetchDate(dateStr);
    console.log(`[Scheduled][Opportunity] Starting opportunity automation for ${dateStr}${specifiedDate ? ' (specified date)' : ''}`);
    try {
        const allUnifiedData = preloadedData || await fetchAndCacheScheduledData(env, dateStr, '[Scheduled][Opportunity]');
        return await generateAndCommitOpportunity(env, dateStr, allUnifiedData);
    } catch (error) {
        console.error(`[Scheduled][Opportunity] Error:`, error);
        return { success: false, date: dateStr, error: error.message };
    }
}

export async function handleScheduledProjectOpportunity(event, env, ctx, specifiedDate = null, preloadedData = null) {
    const dateStr = specifiedDate || getISODate();
    setFetchDate(dateStr);
    console.log(`[Scheduled][ProjectOpportunity] Starting project opportunity automation for ${dateStr}${specifiedDate ? ' (specified date)' : ''}`);
    try {
        const allUnifiedData = preloadedData || await fetchAndCacheScheduledData(env, dateStr, '[Scheduled][ProjectOpportunity]');
        return await generateAndCommitProjectOpportunity(env, dateStr, allUnifiedData);
    } catch (error) {
        console.error(`[Scheduled][ProjectOpportunity] Error:`, error);
        return { success: false, date: dateStr, error: error.message };
    }
}

export async function handleScheduledOpportunityBatch(event, env, ctx, specifiedDate = null) {
    const dateStr = specifiedDate || getISODate();
    setFetchDate(dateStr);
    console.log(`[Scheduled][OpportunityBatch] Starting shared opportunity automation for ${dateStr}${specifiedDate ? ' (specified date)' : ''}`);
    try {
        const allUnifiedData = await fetchAndCacheScheduledData(env, dateStr, '[Scheduled][OpportunityBatch]');
        const opportunity = await generateAndCommitOpportunity(env, dateStr, allUnifiedData);
        const projectOpportunity = await generateAndCommitProjectOpportunity(env, dateStr, allUnifiedData);
        return { success: Boolean(opportunity.success || projectOpportunity.success), date: dateStr, opportunity, projectOpportunity };
    } catch (error) {
        console.error(`[Scheduled][OpportunityBatch] Error:`, error);
        return { success: false, date: dateStr, error: error.message };
    }
}

export async function handleScheduledDaily(event, env, ctx, specifiedDate = null) {
    // 如果指定了日期，使用指定日期；否则使用当前日期
    const dateStr = specifiedDate || getISODate();
    setFetchDate(dateStr);
    console.log(`[Scheduled] Starting daily automation for ${dateStr}${specifiedDate ? ' (specified date)' : ''}`);

    try {
        // 1. Fetch Data
        console.log(`[Scheduled] Fetching data...`);
        // 定时任务无法从浏览器 localStorage 获取 Cookie，这里优先使用环境变量 FOLO_COOKIE，
        // 如果未设置则尝试从 KV(FOLO_COOKIE_KV_KEY) 读取。
        let foloCookie = env.FOLO_COOKIE;
        if (!foloCookie && env.FOLO_COOKIE_KV_KEY) {
            try {
                foloCookie = await getFromKV(env.DATA_KV, env.FOLO_COOKIE_KV_KEY);
                if (foloCookie) console.log(`[Scheduled] Loaded Folo cookie from KV (${env.FOLO_COOKIE_KV_KEY}).`);
            } catch (err) {
                console.warn(`[Scheduled] Failed to load Folo cookie from KV: ${err.message}`);
            }
        }

        const allUnifiedData = await fetchAllData(env, foloCookie);
        const fetchPromises = [];
        const usedFallback = await backfillSparseCategoriesFromKv(env, dateStr, allUnifiedData);
        for (const sourceType in dataSources) {
            if (Object.hasOwnProperty.call(dataSources, sourceType)) {
                fetchPromises.push(storeInKV(env.DATA_KV, `${dateStr}-${sourceType}`, allUnifiedData[sourceType] || []));
            }
        }
        await Promise.all(fetchPromises);
        console.log(`[Scheduled] Data fetched and stored.${usedFallback ? ' Used recent KV fallback.' : ''}`);

        // 2. Prepare Content Items
        // Priority: items with images/videos first
        const selectedContentItems = [];
        const itemsWithMedia = [];
        const itemsWithoutMedia = [];
        
        for (const sourceType in allUnifiedData) {
            const items = allUnifiedData[sourceType];
            if (items && items.length > 0) {
                for (const item of items) {
                    const itemHasMedia = item.details?.content_html && hasMedia(item.details.content_html);
                    let itemText = "";
                    switch (item.type) {
                        case 'news':
                            itemText = `News Title: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nContent Summary: ${stripHtml(item.details.content_html)}`;
                            break;
                        case 'project':
                            itemText = `Project Name: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nDescription: ${item.description}\nStars: ${item.details.totalStars}`;
                            break;
                        case 'paper':
                            itemText = `Papers Title: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nAbstract/Content Summary: ${stripHtml(item.details.content_html)}`;
                            break;
                        case 'socialMedia':
                            itemText = `socialMedia Post by ${item.authors}：Published: ${item.published_date}\nUrl: ${item.url}\nContent: ${stripHtml(item.details.content_html)}`;
                            break;
                        default:
                            itemText = `Type: ${item.type}\nTitle: ${item.title || 'N/A'}\nDescription: ${item.description || 'N/A'}\nURL: ${item.url || 'N/A'}`;
                            if (item.published_date) itemText += `\nPublished: ${item.published_date}`;
                            if (item.source) itemText += `\nSource: ${item.source}`;
                            if (item.details && item.details.content_html) itemText += `\nContent: ${stripHtml(item.details.content_html)}`;
                            break;
                    }
                    if (itemText) {
                        if (itemHasMedia) {
                            itemsWithMedia.push(itemText);
                        } else {
                            itemsWithoutMedia.push(itemText);
                        }
                    }
                }
            }
        }
        
        // Combine: items with media first, then cap the prompt to avoid scheduled LLM timeouts.
        selectedContentItems.push(...selectDailyPromptItems(
            itemsWithMedia,
            itemsWithoutMedia,
            resolveDailyPromptItemCap(env, Boolean(specifiedDate))
        ));
        
        if (itemsWithMedia.length > 0) {
            console.log(`[Scheduled] Found ${itemsWithMedia.length} items with images/videos, ${itemsWithoutMedia.length} items without.`);
        }
        console.log(`[Scheduled] Selected ${selectedContentItems.length} prompt items for daily generation.`);

        if (selectedContentItems.length === 0) {
            console.log(`[Scheduled] No items found. Skipping generation.`);
            return { success: false, date: dateStr, reason: 'no_items' };
        }

        // 3. Generate Content (Call 2)
        console.log(`[Scheduled] Generating content...`);
        let fullPromptForCall2_System = getSystemPromptSummarizationStepOne(dateStr);
        let fullPromptForCall2_User = '\n\n------\n\n'+selectedContentItems.join('\n\n------\n\n')+'\n\n------\n\n';
        
        let outputOfCall2 = await generateScheduledMarkdownWithFallback(
            env,
            fullPromptForCall2_User,
            fullPromptForCall2_System,
            'DailyBody'
        );
        outputOfCall2 = removeMarkdownCodeBlock(outputOfCall2);
        outputOfCall2 = convertPlaceholdersToMarkdownImages(outputOfCall2);
        // 替换错误的域名链接
        outputOfCall2 = replaceIncorrectDomainLinks(outputOfCall2, env.BOOK_LINK ? new URL(env.BOOK_LINK).hostname : 'news.aivora.cn');
        outputOfCall2 = normalizeDailyBody(outputOfCall2);

        // 4. Generate Summary (Call 3)
        console.log(`[Scheduled] Generating summary...`);
        let fullPromptForCall3_System = getSystemPromptSummarizationStepThree();
        let fullPromptForCall3_User = outputOfCall2;
        
        let outputOfCall3 = await generateScheduledMarkdownWithFallback(
            env,
            fullPromptForCall3_User,
            fullPromptForCall3_System,
            'DailySummary'
        );
        outputOfCall3 = removeMarkdownCodeBlock(outputOfCall3);
        outputOfCall3 = normalizeSummaryLines(outputOfCall3);

        // 5. Assemble Markdown
        const contentWithMidAd = insertMidAd(outputOfCall2);
        let dailySummaryMarkdownContent = `## **今日摘要**\n\n\`\`\`\n${outputOfCall3}\n\`\`\`\n\n`;
        dailySummaryMarkdownContent += '\n\n## ⚡ 快速导航\n\n';
        dailySummaryMarkdownContent += '- [📰 今日 AI 资讯](#今日ai资讯) - 最新动态速览\n\n';
        dailySummaryMarkdownContent += `\n\n${contentWithMidAd}`;
        
        if (env.INSERT_AD=='true') dailySummaryMarkdownContent += insertAd() +`\n`;
        if (env.INSERT_FOOT=='true') dailySummaryMarkdownContent += insertFoot() +`\n\n`;

        // 6. Commit to GitHub
        console.log(`[Scheduled] Committing to GitHub...`);
        const yearMonth = getYearMonth(dateStr);
        const dailyFilePath = `daily/${dateStr}.md`;
        const dailyPagePath = `content/cn/${yearMonth}/${dateStr}.md`;
        const monthDirectoryIndexPath = `content/cn/${yearMonth}/_index.md`;
        const homePath = 'content/cn/_index.md';

        const dailyPageTitle = `${env.DAILY_TITLE} ${formatDateToChinese(dateStr)}`;
        const dailyPageContent = buildDailyContentWithFrontMatter(dateStr, dailySummaryMarkdownContent, { title: dailyPageTitle });

        const existingDailySha = await getGitHubFileSha(env, dailyFilePath);
        const dailyCommitMessage = `${existingDailySha ? 'Update' : 'Create'} daily summary for ${dateStr} (Scheduled)`;
        await createOrUpdateGitHubFile(env, dailyFilePath, dailySummaryMarkdownContent, dailyCommitMessage, existingDailySha);

        const existingDailyPageSha = await getGitHubFileSha(env, dailyPagePath);
        const dailyPageCommitMessage = `${existingDailyPageSha ? 'Update' : 'Create'} daily page for ${dateStr} (Scheduled)`;
        await createOrUpdateGitHubFile(env, dailyPagePath, dailyPageContent, dailyPageCommitMessage, existingDailyPageSha);

        // Create or update month directory _index.md
        const monthDirectoryIndexContent = buildMonthDirectoryIndex(yearMonth, { sidebarOpen: true });
        const existingMonthIndexSha = await getGitHubFileSha(env, monthDirectoryIndexPath);
        const monthIndexCommitMessage = `${existingMonthIndexSha ? 'Update' : 'Create'} month directory index for ${yearMonth} (Scheduled)`;
        await createOrUpdateGitHubFile(env, monthDirectoryIndexPath, monthDirectoryIndexContent, monthIndexCommitMessage, existingMonthIndexSha);

        let existingHomeContent = '';
        try {
            existingHomeContent = await getGitHubFileContent(env, homePath);
        } catch (error) {
            console.warn(`[Scheduled] Home page not found, will create a new one.`);
        }
        const homeTitle = dailyPageTitle;
        const homeContent = updateHomeIndexContent(existingHomeContent, dailySummaryMarkdownContent, dateStr, { title: homeTitle });
        const existingHomeSha = await getGitHubFileSha(env, homePath);
        const homeCommitMessage = `${existingHomeSha ? 'Update' : 'Create'} home page for ${dateStr} (Scheduled)`;
        await createOrUpdateGitHubFile(env, homePath, homeContent, homeCommitMessage, existingHomeSha);

        console.log(`[Scheduled] Success!`);
        return { success: true, date: dateStr, selectedCount: selectedContentItems.length };

    } catch (error) {
        console.error(`[Scheduled] Error:`, error);
        return { success: false, date: dateStr, error: error.message };
    }
}

export async function handleScheduled(event, env, ctx, specifiedDate = null, mode = 'daily') {
    if (mode === 'opportunity-batch') {
        return handleScheduledOpportunityBatch(event, env, ctx, specifiedDate);
    }

    if (mode === 'opportunity') {
        return handleScheduledOpportunity(event, env, ctx, specifiedDate);
    }

    if (mode === 'project-opportunity') {
        return handleScheduledProjectOpportunity(event, env, ctx, specifiedDate);
    }

    if (mode === 'all') {
        const daily = await handleScheduledDaily(event, env, ctx, specifiedDate);
        const opportunityBatch = await handleScheduledOpportunityBatch(event, env, ctx, specifiedDate);
        return { daily, ...opportunityBatch };
    }

    return handleScheduledDaily(event, env, ctx, specifiedDate);
}
