import { getISODate, formatDateToChinese, removeMarkdownCodeBlock, stripHtml, convertPlaceholdersToMarkdownImages, setFetchDate, hasMedia, replaceIncorrectDomainLinks } from '../helpers.js';
import { fetchAllData, dataSources } from '../dataFetchers.js';
import { storeInKV, getFromKV } from '../kv.js';
import { callChatAPIStream } from '../chatapi.js';
import { getSystemPromptSummarizationStepOne } from "../prompt/summarizationPromptStepZero";
import { getSystemPromptSummarizationStepThree } from "../prompt/summarizationPromptStepThree";
import { insertFoot } from '../foot.js';
import { insertAd, insertMidAd } from '../ad.js';
import { buildDailyContentWithFrontMatter, getYearMonth, updateHomeIndexContent, buildMonthDirectoryIndex } from '../contentUtils.js';
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

function normalizeDailyBody(markdown) {
    if (!markdown) return '';
    const text = String(markdown);
    const marker = '## **今日';
    const index = text.indexOf(marker);
    if (index <= 0) return text.trim();
    return text.slice(index).trim();
}

export async function handleScheduled(event, env, ctx, specifiedDate = null) {
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
        for (const sourceType in dataSources) {
            if (Object.hasOwnProperty.call(dataSources, sourceType)) {
                fetchPromises.push(storeInKV(env.DATA_KV, `${dateStr}-${sourceType}`, allUnifiedData[sourceType] || []));
            }
        }
        await Promise.all(fetchPromises);
        console.log(`[Scheduled] Data fetched and stored.`);

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
        
        // Combine: items with media first, then items without media
        selectedContentItems.push(...itemsWithMedia, ...itemsWithoutMedia);
        
        if (itemsWithMedia.length > 0) {
            console.log(`[Scheduled] Found ${itemsWithMedia.length} items with images/videos, ${itemsWithoutMedia.length} items without.`);
        }

        if (selectedContentItems.length === 0) {
            console.log(`[Scheduled] No items found. Skipping generation.`);
            return { success: false, date: dateStr, reason: 'no_items' };
        }

        // 3. Generate Content (Call 2)
        console.log(`[Scheduled] Generating content...`);
        let fullPromptForCall2_System = getSystemPromptSummarizationStepOne();
        let fullPromptForCall2_User = '\n\n------\n\n'+selectedContentItems.join('\n\n------\n\n')+'\n\n------\n\n';
        
        let outputOfCall2 = "";
        for await (const chunk of callChatAPIStream(env, fullPromptForCall2_User, fullPromptForCall2_System)) {
            outputOfCall2 += chunk;
        }
        outputOfCall2 = removeMarkdownCodeBlock(outputOfCall2);
        outputOfCall2 = convertPlaceholdersToMarkdownImages(outputOfCall2);
        // 替换错误的域名链接
        outputOfCall2 = replaceIncorrectDomainLinks(outputOfCall2, env.BOOK_LINK ? new URL(env.BOOK_LINK).hostname : 'news.aivora.cn');
        outputOfCall2 = normalizeDailyBody(outputOfCall2);

        // 4. Generate Summary (Call 3)
        console.log(`[Scheduled] Generating summary...`);
        let fullPromptForCall3_System = getSystemPromptSummarizationStepThree();
        let fullPromptForCall3_User = outputOfCall2;
        
        let outputOfCall3 = "";
        for await (const chunk of callChatAPIStream(env, fullPromptForCall3_User, fullPromptForCall3_System)) {
            outputOfCall3 += chunk;
        }
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
