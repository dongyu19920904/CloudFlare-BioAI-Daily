import { getISODate, formatDateToChinese, removeMarkdownCodeBlock, stripHtml, convertPlaceholdersToMarkdownImages, setFetchDate, hasMedia, replaceIncorrectDomainLinks, normalizeDailyBody } from '../helpers.js';
import { fetchAllData, dataSources } from '../dataFetchers.js';
import { storeInKV, getFromKV } from '../kv.js';
import { callChatAPI, callChatAPIStream } from '../chatapi.js';
import { getSystemPromptSummarizationStepOne } from "../prompt/summarizationPromptStepZero";
import { getSystemPromptSummarizationStepThree } from "../prompt/summarizationPromptStepThree";
import { getSystemPromptBioOpportunity } from "../prompt/bioOpportunityPrompt.js";
import { getSystemPromptBioProjectOpportunity } from "../prompt/bioProjectOpportunityPrompt.js";
import { buildDailyContentWithFrontMatter, getYearMonth, updateHomeIndexContent, buildMonthDirectoryIndex } from '../contentUtils.js';
import { resolveDailyPromptItemCap, selectDailyPromptCandidates } from '../dailyPromptSelection.js';
import {
    buildEditorialDedupeKeys,
    buildEvidenceOverview,
    formatDailyPromptItem,
    matchDailyEvidenceItems,
    normalizeEditorialItem,
    validateDailyMarkdown,
} from '../bioEditorialPolicy.js';
import {
    DEFAULT_BIO_OPPORTUNITY_DESCRIPTION,
    DEFAULT_BIO_PROJECT_OPPORTUNITY_DESCRIPTION,
    buildBioSectionMonthIndexContent,
    buildBioSectionPageContent,
    buildBioSectionPaths,
    updateBioSectionHomeIndexContent,
} from '../bioOpportunityUtils.js';
import { createOrUpdateGitHubFile, getGitHubFileContent, getGitHubFileSha } from '../github.js';

function normalizeSummaryLines(summaryText, fallbackLines = []) {
    const lines = String(summaryText || '')
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^[-*\d.、]+\s*/, ''))
        .filter(Boolean);
    for (const fallbackLine of fallbackLines) {
        if (lines.length >= 3) break;
        if (fallbackLine && !lines.includes(fallbackLine)) lines.push(fallbackLine);
    }
    return lines.slice(0, 3).join('\n');
}

function shiftDate(dateStr, days) {
    const baseDate = new Date(`${dateStr}T00:00:00+08:00`);
    return getISODate(new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000));
}

async function backfillSparseCategoriesFromKv(env, dateStr, allUnifiedData, dedupeKeys = null) {
    const lookbackDays = parsePositiveInteger(env.LONGEVITY_BACKFILL_DAYS || env.FOLO_FILTER_DAYS, 5);
    const categories = ['news', 'paper', 'socialMedia'];
    const maxBackfillItems = parsePositiveInteger(env.LONGEVITY_MAX_BACKFILL_ITEMS, 4);
    let usedFallback = false;

    for (const category of categories) {
        if ((allUnifiedData[category] || []).length > 0) {
            continue;
        }

        for (let offset = 1; offset <= lookbackDays; offset += 1) {
            const previousDate = shiftDate(dateStr, -offset);
            const cachedItems = await getFromKV(env.DATA_KV, `${previousDate}-${category}`);
            if (Array.isArray(cachedItems) && cachedItems.length > 0) {
                const fallbackItems = cachedItems
                    .filter((item) => !hasDedupeMatch(item, dedupeKeys))
                    .slice(0, maxBackfillItems)
                    .map((item) => ({
                        ...item,
                        details: {
                            ...(item.details || {}),
                            backfilledFrom: previousDate,
                        },
                    }));
                if (fallbackItems.length === 0) {
                    continue;
                }
                for (const item of fallbackItems) {
                    addDedupeKeys(item, dedupeKeys);
                }
                allUnifiedData[category] = fallbackItems;
                usedFallback = true;
                console.log(`[Scheduled] Backfilled ${category} from ${previousDate} (${fallbackItems.length} non-duplicate items).`);
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

function hasDedupeMatch(item, dedupeKeys) {
    if (!dedupeKeys) return false;
    return buildEditorialDedupeKeys(item).some((key) => dedupeKeys.values.has(key));
}

function addDedupeKeys(item, dedupeKeys) {
    if (!dedupeKeys) return;
    for (const key of buildEditorialDedupeKeys(item)) dedupeKeys.values.add(key);
}

async function buildRecentDedupeKeys(env, dateStr, categories, lookbackDays, logPrefix) {
    const dedupeKeys = { values: new Set() };
    if (!env.DATA_KV || lookbackDays <= 0) return dedupeKeys;

    for (let offset = 1; offset <= lookbackDays; offset += 1) {
        const previousDate = shiftDate(dateStr, -offset);
        for (const category of categories) {
            try {
                const cachedItems = await getFromKV(env.DATA_KV, `${previousDate}-${category}`);
                for (const item of cachedItems || []) {
                    addDedupeKeys(item, dedupeKeys);
                }
            } catch (error) {
                console.warn(`${logPrefix} Failed to load ${previousDate}-${category} for de-duplication: ${error.message}`);
            }
        }
    }

    return dedupeKeys;
}

function filterRecentDuplicates(allUnifiedData, dedupeKeys, logPrefix) {
    if (!dedupeKeys) return 0;
    let removedCount = 0;

    for (const sourceType in allUnifiedData) {
        if (!Object.hasOwnProperty.call(allUnifiedData, sourceType)) continue;
        const nextItems = [];
        for (const item of allUnifiedData[sourceType] || []) {
            if (hasDedupeMatch(item, dedupeKeys)) {
                removedCount += 1;
                continue;
            }
            addDedupeKeys(item, dedupeKeys);
            nextItems.push(item);
        }
        allUnifiedData[sourceType] = nextItems;
    }

    if (removedCount > 0) {
        console.log(`${logPrefix} Removed ${removedCount} items duplicated within the recent lookback window.`);
    }
    return removedCount;
}

function snapshotDataForCache(allUnifiedData) {
    const cacheData = {};
    for (const sourceType in dataSources) {
        if (Object.hasOwnProperty.call(dataSources, sourceType)) {
            cacheData[sourceType] = [...(allUnifiedData[sourceType] || [])];
        }
    }
    return cacheData;
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
    const categories = Object.keys(dataSources);
    const dedupeDays = parsePositiveInteger(env.DAILY_DEDUPE_DAYS, 7);
    const dedupeKeys = await buildRecentDedupeKeys(env, dateStr, categories, dedupeDays, logPrefix);
    filterRecentDuplicates(allUnifiedData, dedupeKeys, logPrefix);
    const cacheData = snapshotDataForCache(allUnifiedData);
    const usedFallback = await backfillSparseCategoriesFromKv(env, dateStr, allUnifiedData, dedupeKeys);
    const fetchPromises = [];

    for (const sourceType in dataSources) {
        if (Object.hasOwnProperty.call(dataSources, sourceType)) {
            fetchPromises.push(storeInKV(env.DATA_KV, `${dateStr}-${sourceType}`, cacheData[sourceType] || []));
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

    const monthIndexContent = buildBioSectionMonthIndexContent(paths.yearMonth, { sidebarOpen: true });
    const existingMonthIndexSha = await getGitHubFileSha(env, paths.monthIndexPath);
    await createOrUpdateGitHubFile(
        env,
        paths.monthIndexPath,
        monthIndexContent,
        `${existingMonthIndexSha ? 'Update' : 'Create'} ${section} month index for ${paths.yearMonth} (Scheduled)`,
        existingMonthIndexSha
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
        nextPath: paths.publicPath,
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
        const allUnifiedData = await fetchAndCacheScheduledData(env, dateStr, '[Scheduled]');

        // 2. Prepare evidence-aware content candidates. Images are not passed to the
        // model because feed images may be licensed figures or unstable hotlinks.
        const promptCandidates = [];
        const sourceStats = {};
        
        for (const sourceType in allUnifiedData) {
            const items = allUnifiedData[sourceType];
            if (items && items.length > 0) {
                for (const rawItem of items) {
                    const item = rawItem.details?.editorial ? rawItem : normalizeEditorialItem(rawItem, sourceType);
                    const editorial = item.details.editorial;
                    if (editorial.dailyExclusionReason) {
                        console.log(`[Scheduled] Skipping ${editorial.canonicalId}: ${editorial.dailyExclusionReason}.`);
                        continue;
                    }
                    const resolvedSourceType = item.type || sourceType;
                    const itemHasMedia = Boolean(item.details?.content_html && hasMedia(item.details.content_html));
                    sourceStats[resolvedSourceType] = sourceStats[resolvedSourceType] || { total: 0, primary: 0 };
                    sourceStats[resolvedSourceType].total += 1;
                    if (editorial.sourceAuthority === '一手/官方') sourceStats[resolvedSourceType].primary += 1;
                    promptCandidates.push({
                        key: editorial.canonicalId || item.url || `${resolvedSourceType}:${item.title}`,
                        text: formatDailyPromptItem(item),
                        sourceType: resolvedSourceType,
                        hasMedia: itemHasMedia,
                        publishedDate: item.published_date,
                        url: editorial.primarySourceUrl || item.url,
                        title: item.title,
                        editorial,
                        item,
                    });
                }
            }
        }
        
        const selectedCandidates = selectDailyPromptCandidates(
            promptCandidates,
            env,
            resolveDailyPromptItemCap(env, Boolean(specifiedDate))
        );
        const selectedContentItems = selectedCandidates.map((candidate) => candidate.text);
        
        const selectedStats = selectedCandidates.reduce((acc, candidate) => {
            acc[candidate.sourceType] = (acc[candidate.sourceType] || 0) + 1;
            return acc;
        }, {});
        console.log(`[Scheduled] Source stats before selection: ${JSON.stringify(sourceStats)}.`);
        console.log(`[Scheduled] Selected ${selectedContentItems.length} prompt items for daily generation: ${JSON.stringify(selectedStats)}.`);

        if (selectedContentItems.length < 3) {
            console.log(`[Scheduled] Only ${selectedContentItems.length} qualified items found. Skipping generation.`);
            return { success: false, date: dateStr, reason: 'insufficient_qualified_items', selectedCount: selectedContentItems.length };
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
        outputOfCall2 = replaceIncorrectDomainLinks(outputOfCall2, env.BOOK_LINK ? new URL(env.BOOK_LINK).hostname : 'news.aibioo.cn');
        outputOfCall2 = normalizeDailyBody(outputOfCall2);

        const expectedEvidenceItems = selectedCandidates.map((candidate) => candidate.item);
        let bodyValidation = validateDailyMarkdown(outputOfCall2, expectedEvidenceItems);
        if (!bodyValidation.valid) {
            console.warn(`[Scheduled] Daily body validation failed; attempting one targeted repair: ${bodyValidation.errors.join('; ')}`);
            const repairSystemPrompt = `${getSystemPromptSummarizationStepOne(dateStr)}\n\n这是一次格式与证据边界修复。只修复列出的错误，保留原始事实和 URL，不新增素材。`;
            const repairUserPrompt = `校验错误：\n- ${bodyValidation.errors.join('\n- ')}\n\n待修复原稿：\n${outputOfCall2}`;
            outputOfCall2 = await generateScheduledMarkdownWithFallback(
                env,
                repairUserPrompt,
                repairSystemPrompt,
                'DailyBodyRepair'
            );
            outputOfCall2 = normalizeDailyBody(replaceIncorrectDomainLinks(
                convertPlaceholdersToMarkdownImages(removeMarkdownCodeBlock(outputOfCall2)),
                env.BOOK_LINK ? new URL(env.BOOK_LINK).hostname : 'news.aibioo.cn'
            ));
            bodyValidation = validateDailyMarkdown(outputOfCall2, expectedEvidenceItems);
        }

        if (!bodyValidation.valid) {
            console.error(`[Scheduled] Daily body remains invalid after one repair. Publication skipped: ${bodyValidation.errors.join('; ')}`);
            return {
                success: false,
                date: dateStr,
                reason: 'invalid_daily_output',
                validationErrors: bodyValidation.errors,
                selectedCount: selectedContentItems.length,
            };
        }

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
        const publishedEvidenceItems = matchDailyEvidenceItems(outputOfCall2, expectedEvidenceItems);
        const evidenceOverview = buildEvidenceOverview(publishedEvidenceItems);
        outputOfCall3 = normalizeSummaryLines(outputOfCall3, [
            `今天筛选出 ${bodyValidation.signalCount} 条值得跟踪的 AI 与衰老研究信号。`,
            evidenceOverview,
            '距离日常医疗或抗衰应用仍需独立验证、监管评估与长期随访。',
        ]);

        // 5. Assemble Markdown
        const conclusionLines = outputOfCall3.split(/\r?\n/).filter(Boolean).map((line) => `- ${line}`).join('\n');
        let dailySummaryMarkdownContent = `## 今日结论\n\n${conclusionLines}\n\n`;
        dailySummaryMarkdownContent += `## 证据概览\n\n> ${evidenceOverview}\n\n`;
        dailySummaryMarkdownContent += `${outputOfCall2}\n\n`;
        dailySummaryMarkdownContent += '> 阅读提示：本站内容用于信息与研究跟踪，不构成诊断、治疗、用药或抗衰建议。证据等级表示当前研究可信度，不等于临床可用性。\n';

        if (String(env.DAILY_DRY_RUN || '').toLowerCase() === 'true') {
            console.log(`[Scheduled] Dry-run passed validation. GitHub publication skipped.`);
            return {
                success: true,
                dryRun: true,
                date: dateStr,
                selectedCount: selectedContentItems.length,
                signalCount: bodyValidation.signalCount,
                evidenceOverview,
                markdown: dailySummaryMarkdownContent,
            };
        }

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
        const homeTitle = env.DAILY_TITLE || 'AI 生命延续学日报';
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
