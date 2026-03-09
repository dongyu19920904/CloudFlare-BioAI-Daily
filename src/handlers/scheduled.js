import { getISODate, formatDateToChinese, removeMarkdownCodeBlock, stripHtml, convertPlaceholdersToMarkdownImages, setFetchDate, hasMedia, replaceIncorrectDomainLinks, normalizeDailyBody } from '../helpers.js';
import { fetchAllData, dataSources } from '../dataFetchers.js';
import { storeInKV, getFromKV } from '../kv.js';
import { callChatAPIStream } from '../chatapi.js';
import { getSystemPromptSummarizationStepOne } from "../prompt/summarizationPromptStepZero";
import { getSystemPromptSummarizationStepThree } from "../prompt/summarizationPromptStepThree";
import { insertFoot } from '../foot.js';
import { insertAd, insertMidAd } from '../ad.js';
import { buildDailyContentWithFrontMatter, getYearMonth, updateHomeIndexContent, buildMonthDirectoryIndex } from '../contentUtils.js';
import { createOrUpdateGitHubFile, getGitHubFileContent, getGitHubFileSha } from '../github.js';
import { normalizeDailyStructure, validateDailyContentModules as validateDailyStructure } from '../dailyValidation.js';

function normalizeSummaryLines(summaryText) {
    if (!summaryText) return '';
    const lines = String(summaryText)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length <= 3) return summaryText.trim();
    return lines.slice(-3).join('\n');
}

function normalizeGeneratedDailyBody(markdown, env) {
    let output = removeMarkdownCodeBlock(markdown);
    output = convertPlaceholdersToMarkdownImages(output);
    output = replaceIncorrectDomainLinks(output, env.BOOK_LINK ? new URL(env.BOOK_LINK).hostname : 'news.aivora.cn');
    output = normalizeDailyBody(output);
    return normalizeDailyStructure(output, { kind: 'bio' });
}

function buildRetrySystemPrompt(dateStr, previousError) {
    return `${getSystemPromptSummarizationStepOne(dateStr)}

## 杈撳嚭淇瑕佹眰锛堝繀椤婚伒瀹堬級
1. 鐩存帴浠庘€?# **浠婃棩AI鐢熷懡绉戝璧勮**鈥濆紑濮嬭緭鍑猴紝涓嶈鍐欏墠瑷€銆佽В閲娿€佹€荤粨鎴栨彁绀鸿銆?2. 蹇呴』瀹屾暣鍖呭惈杩?5 涓簩绾ф爣棰橈細
   - ## **浠婃棩AI鐢熷懡绉戝璧勮**
   - ## **馃敟 閲嶇 TOP 10**
   - ## **馃搶 鍊煎緱鍏虫敞**
   - ## **馃敭 AI瓒嬪娍棰勬祴**
   - ## **鉂?鐩稿叧闂**
3. 鈥滈噸纾?TOP 10鈥濅笅鐨勬瘡鏉″唴瀹瑰繀椤讳娇鐢ㄢ€?## 1. [鏍囬](URL)鈥濊繖绉嶇紪鍙锋牸寮忥紱濡傛灉绱犳潗涓嶈冻锛屽彲浠ュ皯浜?10 鏉★紝浣嗕笉瑕佺暀绌恒€?4. 涓嶈缂栭€犱俊鎭紝涓嶈鍒犻櫎宸叉湁閾炬帴锛屽彧鍏佽閲嶇粍鍜屾鼎鑹插凡鏈夌礌鏉愩€?5. 鍙緭鍑?Markdown 姝ｆ枃銆?
涓婁竴娆″け璐ュ師鍥狅細${previousError}`;
}

async function generateValidatedDailyBody(env, dateStr, selectedContentItems) {
    const promptUser = '\n\n------\n\n' + selectedContentItems.join('\n\n------\n\n') + '\n\n------\n\n';
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const systemPrompt = attempt === 0
            ? getSystemPromptSummarizationStepOne(dateStr)
            : buildRetrySystemPrompt(dateStr, lastError?.message || '???????????');
        try {
            let output = '';
            for await (const chunk of callChatAPIStream(env, promptUser, systemPrompt)) {
                output += chunk;
            }
            output = normalizeGeneratedDailyBody(output, env);
            validateDailyStructure(output, env, { kind: 'bio' });
            return output;
        } catch (error) {
            lastError = error;
            console.warn(`[Scheduled] Generated content failed on attempt ${attempt + 1}: ${error.message}`);
            if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
            }
        }
    }

    throw lastError;
}

async function generateSummaryText(env, markdown) {
    const systemPrompt = getSystemPromptSummarizationStepThree();
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            let output = '';
            for await (const chunk of callChatAPIStream(env, markdown, systemPrompt)) {
                output += chunk;
            }
            output = removeMarkdownCodeBlock(output);
            return normalizeSummaryLines(output);
        } catch (error) {
            lastError = error;
            console.warn(`[Scheduled] Summary generation failed on attempt ${attempt + 1}: ${error.message}`);
            if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
            }
        }
    }

    throw lastError;
}

const REQUIRED_DAILY_SECTIONS = [];

function getTopItemsMinCount(env) {
    return Number.parseInt(String(env.DAILY_TOP_MIN_ITEMS ?? '7').trim(), 10) || 7;
}

function getTopSectionText(markdown) {
    return String(markdown || '');
}

function countTopItems(markdown) {
    return 0;
}

function validateDailyContentModules(markdown, env) {
    return validateDailyStructure(markdown, env, { kind: 'bio' });
}


export async function handleScheduled(event, env, ctx, specifiedDate = null) {
    // 濡傛灉鎸囧畾浜嗘棩鏈燂紝浣跨敤鎸囧畾鏃ユ湡锛涘惁鍒欎娇鐢ㄥ綋鍓嶆棩鏈?
    const dateStr = specifiedDate || getISODate();
    setFetchDate(dateStr);
    console.log(`[Scheduled] Starting daily automation for ${dateStr}${specifiedDate ? ' (specified date)' : ''}`);

    try {
        // 1. Fetch Data
        console.log(`[Scheduled] Fetching data...`);
        // 瀹氭椂浠诲姟鏃犳硶浠庢祻瑙堝櫒 localStorage 鑾峰彇 Cookie锛岃繖閲屼紭鍏堜娇鐢ㄧ幆澧冨彉閲?FOLO_COOKIE锛?
        // 濡傛灉鏈缃垯灏濊瘯浠?KV(FOLO_COOKIE_KV_KEY) 璇诲彇銆?
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
                            itemText = `socialMedia Post by ${item.authors}锛歅ublished: ${item.published_date}\nUrl: ${item.url}\nContent: ${stripHtml(item.details.content_html)}`;
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
        let outputOfCall2 = await generateValidatedDailyBody(env, dateStr, selectedContentItems);
        validateDailyContentModules(outputOfCall2, env);

        // 4. Generate Summary (Call 3)
        console.log(`[Scheduled] Generating summary...`);
        let outputOfCall3 = await generateSummaryText(env, outputOfCall2);

        // 5. Assemble Markdown
        const contentWithMidAd = insertMidAd(outputOfCall2);
        let dailySummaryMarkdownContent = `## **浠婃棩鎽樿**\n\n\`\`\`\n${outputOfCall3}\n\`\`\`\n\n`;
        dailySummaryMarkdownContent += '\n\n## 鈿?蹇€熷鑸猏n\n';
        dailySummaryMarkdownContent += '- [馃摪 浠婃棩 AI 璧勮](#浠婃棩ai璧勮) - 鏈€鏂板姩鎬侀€熻\n\n';
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
        throw error;
    }
}
