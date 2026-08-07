import { getISODate, formatDateToChinese, removeMarkdownCodeBlock, stripHtml, convertPlaceholdersToMarkdownImages, setFetchDate, replaceIncorrectDomainLinks, normalizeDailyBody } from '../helpers.js';
import { fetchAllData, dataSources } from '../dataFetchers.js';
import { storeInKV, getFromKV } from '../kv.js';
import { callChatAPI, callChatAPIStream } from '../chatapi.js';
import { getSystemPromptSummarizationStepOne } from "../prompt/summarizationPromptStepZero.js";
import { getSystemPromptSummarizationStepThree } from "../prompt/summarizationPromptStepThree";
import { getSystemPromptBioOpportunity } from "../prompt/bioOpportunityPrompt.js";
import { getSystemPromptBioProjectOpportunity } from "../prompt/bioProjectOpportunityPrompt.js";
import { buildDailyContentWithFrontMatter, getYearMonth, buildMonthDirectoryIndex } from '../contentUtils.js';
import { resolveDailyMinimumItemCount, resolveDailyPromptItemCap, selectDailyPromptCandidates } from '../dailyPromptSelection.js';
import {
    buildDailyCandidateIdentity,
    buildDailyEvidencePromptHint,
    getDailyCandidateDedupeKeys,
} from '../bioDailyEvidence.js';
import {
    assembleBioDailyMarkdown,
    buildBioDailyRepairSystemPrompt,
    sanitizeBioDailyMedia,
    shouldAdoptBioDailyRepair,
    summarizeBioDailyEvidence,
    validateBioDailyMarkdown,
} from '../bioDailyPublication.js';
import { extractDailyMediaCandidates, prepareDailyCandidatesMedia } from '../bioDailyMedia.js';
import { buildBioDailyRunId, storeBioDailyStatus } from '../bioDailyStatus.js';
import { runIndependentBioTasks } from '../bioTaskIsolation.js';
import {
    DEFAULT_BIO_OPPORTUNITY_DESCRIPTION,
    DEFAULT_BIO_PROJECT_OPPORTUNITY_DESCRIPTION,
    buildBioSectionMonthIndexContent,
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

function buildDailyCandidatePromptText(candidate) {
    const identity = buildDailyCandidateIdentity(candidate);
    const mediaHints = (candidate.media || [])
        .map((media) => `[可用图片: ${media.alt} ${media.url}；图注来源：${media.source}]`);
    return [
        `Type: ${candidate.sourceType || 'unknown'}`,
        `Title: ${candidate.title || 'N/A'}`,
        `Published: ${candidate.publishedDate || 'N/A'}`,
        `Source name: ${candidate.source || 'N/A'}`,
        `Url: ${identity.canonicalUrl || candidate.url || 'N/A'}`,
        candidate.description ? `Description: ${truncatePromptText(candidate.description, 500)}` : '',
        candidate.contentText ? `Content: ${candidate.contentText}` : '',
        buildDailyEvidencePromptHint(candidate),
        ...mediaHints,
    ].filter(Boolean).join('\n');
}

function normalizeDedupeUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        for (const key of [...parsed.searchParams.keys()]) {
            if (/^(utm_|fbclid$|gclid$|ref$|ref_src$)/i.test(key)) {
                parsed.searchParams.delete(key);
            }
        }
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '').toLowerCase();
    } catch {
        return String(url).trim().replace(/\/$/, '').toLowerCase();
    }
}

function normalizeDedupeTitle(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getItemDedupeKeys(item) {
    return {
        url: normalizeDedupeUrl(item?.url),
        title: normalizeDedupeTitle(item?.title),
    };
}

function hasDedupeMatch(item, dedupeKeys) {
    if (!dedupeKeys) return false;
    const keys = getItemDedupeKeys(item);
    if (keys.url && dedupeKeys.urls.has(keys.url)) return true;
    return keys.title && keys.title.length >= 24 && dedupeKeys.titles.has(keys.title);
}

function addDedupeKeys(item, dedupeKeys) {
    if (!dedupeKeys) return;
    const keys = getItemDedupeKeys(item);
    if (keys.url) dedupeKeys.urls.add(keys.url);
    if (keys.title && keys.title.length >= 24) dedupeKeys.titles.add(keys.title);
}

async function buildRecentDedupeKeys(env, dateStr, categories, lookbackDays, logPrefix) {
    const dedupeKeys = { urls: new Set(), titles: new Set() };
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

async function fetchAndCacheScheduledData(env, dateStr, logPrefix = '[Scheduled]', options = {}) {
    console.log(`${logPrefix} Fetching data...`);
    const foloCookie = await resolveScheduledFoloCookie(env, logPrefix);
    const allUnifiedData = await fetchAllData(env, foloCookie);
    const categories = Object.keys(dataSources);
    let dedupeKeys = null;
    if (options.dedupeMode !== 'accepted-daily') {
        const dedupeDays = parsePositiveInteger(env.DAILY_DEDUPE_DAYS, 7);
        dedupeKeys = await buildRecentDedupeKeys(env, dateStr, categories, dedupeDays, logPrefix);
        filterRecentDuplicates(allUnifiedData, dedupeKeys, logPrefix);
    }
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

async function loadRecentAcceptedDailyKeys(env, dateStr) {
    const accepted = new Set();
    if (!env.DATA_KV) return accepted;
    const lookbackDays = parsePositiveInteger(env.DAILY_DEDUPE_DAYS, 7);
    for (let offset = 1; offset <= lookbackDays; offset += 1) {
        const previousDate = shiftDate(dateStr, -offset);
        try {
            const keys = await getFromKV(env.DATA_KV, `bio-daily-accepted:${previousDate}`);
            for (const key of keys || []) accepted.add(key);
        } catch (error) {
            console.warn(`[Scheduled][Daily] Failed to load accepted memory for ${previousDate}: ${error.message}`);
        }
    }
    return accepted;
}

async function storeAcceptedDailyKeys(env, dateStr, selectedCandidates) {
    if (!env.DATA_KV) return;
    const keys = [...new Set(selectedCandidates.flatMap((candidate) => getDailyCandidateDedupeKeys(candidate)))];
    await storeInKV(env.DATA_KV, `bio-daily-accepted:${dateStr}`, keys, 86400 * 14);
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
        const results = await runIndependentBioTasks({
            opportunity: () => generateAndCommitOpportunity(env, dateStr, allUnifiedData),
            projectOpportunity: () => generateAndCommitProjectOpportunity(env, dateStr, allUnifiedData),
        });
        const opportunity = { date: dateStr, ...results.opportunity };
        const projectOpportunity = { date: dateStr, ...results.projectOpportunity };
        return { success: Boolean(opportunity.success || projectOpportunity.success), date: dateStr, opportunity, projectOpportunity };
    } catch (error) {
        console.error(`[Scheduled][OpportunityBatch] Error:`, error);
        return { success: false, date: dateStr, error: error.message };
    }
}

export async function handleScheduledDaily(event, env, ctx, specifiedDate = null) {
    const dateStr = specifiedDate || getISODate();
    const runId = buildBioDailyRunId(dateStr);
    const dryRun = String(env.DAILY_DRY_RUN || '').toLowerCase() === 'true';
    setFetchDate(dateStr);
    console.log(`[Scheduled][Daily] Starting ${dryRun ? 'dry-run' : 'publication'} for ${dateStr} (${runId}).`);

    const recordStatus = async (status) => {
        try {
            await storeBioDailyStatus(env, dateStr, { runId, dryRun, ...status });
        } catch (error) {
            console.warn(`[Scheduled][Daily] Status write failed without blocking the task: ${error.message}`);
        }
    };

    await recordStatus({ state: 'running', phase: 'fetching', progress: 5 });
    let publicationStarted = false;

    try {
        const allUnifiedData = await fetchAndCacheScheduledData(
            env,
            dateStr,
            '[Scheduled][Daily]',
            { dedupeMode: 'accepted-daily' }
        );
        const acceptedKeys = await loadRecentAcceptedDailyKeys(env, dateStr);
        const promptCandidates = [];
        const sourceStats = {};

        for (const sourceType in allUnifiedData) {
            const items = allUnifiedData[sourceType];
            for (const item of items || []) {
                const mediaCandidates = extractDailyMediaCandidates(item);
                const itemHasMedia = mediaCandidates.length > 0;
                const resolvedType = item.type || sourceType;
                sourceStats[resolvedType] = sourceStats[resolvedType] || { total: 0, media: 0 };
                sourceStats[resolvedType].total += 1;
                if (itemHasMedia) sourceStats[resolvedType].media += 1;

                const candidate = {
                    key: item.url || `${resolvedType}:${item.title}`,
                    sourceType: resolvedType,
                    hasMedia: itemHasMedia,
                    publishedDate: item.published_date,
                    url: item.url,
                    title: item.title,
                    description: item.description || '',
                    source: item.source || 'Unknown',
                    details: item.details || {},
                    mediaCandidates,
                };
                const contentText = truncatePromptText(
                    stripHtml(item?.details?.content_html || item?.description || ''),
                    1400
                );
                candidate.contentText = contentText;
                candidate.text = buildDailyCandidatePromptText(candidate);
                promptCandidates.push(candidate);
            }
        }

        const minimumItems = resolveDailyMinimumItemCount(env);
        let selectedCandidates = selectDailyPromptCandidates(
            promptCandidates,
            env,
            resolveDailyPromptItemCap(env, Boolean(specifiedDate)),
            { acceptedKeys }
        );
        selectedCandidates = await prepareDailyCandidatesMedia(selectedCandidates, env);
        selectedCandidates = selectedCandidates.map((candidate) => ({
            ...candidate,
            text: buildDailyCandidatePromptText(candidate),
        }));
        const selectedContentItems = selectedCandidates.map((candidate) => candidate.text);
        const selectedStats = selectedCandidates.reduce((acc, candidate) => {
            const key = `${candidate.sourceType}:${candidate.pool || 'unclassified'}`;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        console.log(`[Scheduled][Daily] Source stats: ${JSON.stringify(sourceStats)}.`);
        console.log(`[Scheduled][Daily] Selected ${selectedContentItems.length} candidates: ${JSON.stringify(selectedStats)}.`);

        if (selectedContentItems.length < minimumItems) {
            const reason = `insufficient_qualified_items:${selectedContentItems.length}/${minimumItems}`;
            await recordStatus({ state: 'not-published', phase: 'selection', progress: 100, reason });
            return { success: false, published: false, date: dateStr, runId, reason };
        }

        await recordStatus({ state: 'running', phase: 'generating', progress: 35, selectedCount: selectedContentItems.length });
        let outputOfCall2 = await generateScheduledMarkdownWithFallback(
            env,
            `报告日期：${dateStr}\n\n候选素材：\n\n${selectedContentItems.join('\n\n------\n\n')}`,
            getSystemPromptSummarizationStepOne(dateStr),
            'DailyBody'
        );
        outputOfCall2 = removeMarkdownCodeBlock(outputOfCall2);
        outputOfCall2 = convertPlaceholdersToMarkdownImages(outputOfCall2);
        outputOfCall2 = replaceIncorrectDomainLinks(outputOfCall2, env.BOOK_LINK ? new URL(env.BOOK_LINK).hostname : 'news.aibioo.cn');
        outputOfCall2 = normalizeDailyBody(outputOfCall2);
        outputOfCall2 = sanitizeBioDailyMedia(outputOfCall2, selectedCandidates);

        let validation = validateBioDailyMarkdown(outputOfCall2, selectedCandidates, {
            minItems: minimumItems,
            maxItems: 8,
        });
        let repairAttempted = false;
        if (!validation.passed) {
            repairAttempted = true;
            console.warn(`[Scheduled][Daily] Validation failed; attempting one targeted repair: ${validation.errors.join(' | ')}`);
            const repaired = await generateScheduledMarkdownWithFallback(
                env,
                `请修订以下草稿：\n\n${outputOfCall2}`,
                buildBioDailyRepairSystemPrompt(validation.errors, selectedCandidates),
                'DailyRepair'
            );
            const repairedBody = sanitizeBioDailyMedia(
                normalizeDailyBody(convertPlaceholdersToMarkdownImages(removeMarkdownCodeBlock(repaired))),
                selectedCandidates
            );
            const repairedValidation = validateBioDailyMarkdown(repairedBody, selectedCandidates, {
                minItems: minimumItems,
                maxItems: 8,
            });
            if (shouldAdoptBioDailyRepair(validation, repairedValidation)) {
                outputOfCall2 = repairedBody;
                validation = repairedValidation;
            }
        }

        if (!validation.passed) {
            await recordStatus({
                state: 'not-published',
                phase: 'validation',
                progress: 100,
                selectedCount: selectedContentItems.length,
                repairAttempted,
                validationErrors: validation.errors,
            });
            return {
                success: false,
                published: false,
                date: dateStr,
                runId,
                reason: 'validation_failed',
                repairAttempted,
                validation,
            };
        }

        await recordStatus({ state: 'running', phase: 'summarizing', progress: 65, validationPassed: true });
        let outputOfCall3 = await generateScheduledMarkdownWithFallback(
            env,
            outputOfCall2,
            getSystemPromptSummarizationStepThree(),
            'DailySummary'
        );
        outputOfCall3 = removeMarkdownCodeBlock(outputOfCall3);
        outputOfCall3 = normalizeSummaryLines(outputOfCall3);
        const dailySummaryMarkdownContent = assembleBioDailyMarkdown(outputOfCall2, outputOfCall3);
        const evidenceSummary = summarizeBioDailyEvidence(outputOfCall2);

        if (dryRun) {
            await recordStatus({
                state: 'dry-run',
                phase: 'complete',
                progress: 100,
                selectedCount: selectedContentItems.length,
                itemCount: validation.itemCount,
                validationPassed: true,
                repairAttempted,
            });
            return {
                success: true,
                published: false,
                dryRun: true,
                date: dateStr,
                runId,
                selectedCount: selectedContentItems.length,
                validation,
                preview: dailySummaryMarkdownContent,
            };
        }

        await recordStatus({ state: 'running', phase: 'publishing', progress: 80, validationPassed: true });
        publicationStarted = true;
        const yearMonth = getYearMonth(dateStr);
        const dailyFilePath = `daily/${dateStr}.md`;
        const dailyPagePath = `content/cn/${yearMonth}/${dateStr}.md`;
        const monthDirectoryIndexPath = `content/cn/${yearMonth}/_index.md`;

        const dailyPageTitle = `${env.DAILY_TITLE} ${formatDateToChinese(dateStr)}`;
        const dailyPageContent = buildDailyContentWithFrontMatter(dateStr, dailySummaryMarkdownContent, {
            title: dailyPageTitle,
            evidenceSummary,
        });

        // Publish the canonical date page before updating pointers or blog input.
        const existingDailyPageSha = await getGitHubFileSha(env, dailyPagePath);
        const dailyPageCommitMessage = `${existingDailyPageSha ? 'Update' : 'Create'} daily page for ${dateStr} (Scheduled)`;
        await createOrUpdateGitHubFile(env, dailyPagePath, dailyPageContent, dailyPageCommitMessage, existingDailyPageSha);

        // Create or update month directory _index.md
        const monthDirectoryIndexContent = buildMonthDirectoryIndex(yearMonth, { sidebarOpen: true });
        const existingMonthIndexSha = await getGitHubFileSha(env, monthDirectoryIndexPath);
        const monthIndexCommitMessage = `${existingMonthIndexSha ? 'Update' : 'Create'} month directory index for ${yearMonth} (Scheduled)`;
        await createOrUpdateGitHubFile(env, monthDirectoryIndexPath, monthDirectoryIndexContent, monthIndexCommitMessage, existingMonthIndexSha);

        const existingDailySha = await getGitHubFileSha(env, dailyFilePath);
        const dailyCommitMessage = `${existingDailySha ? 'Update' : 'Create'} daily summary for ${dateStr} (Scheduled)`;
        await createOrUpdateGitHubFile(env, dailyFilePath, dailySummaryMarkdownContent, dailyCommitMessage, existingDailySha);

        await storeAcceptedDailyKeys(env, dateStr, selectedCandidates);
        await recordStatus({
            state: 'published',
            phase: 'complete',
            progress: 100,
            selectedCount: selectedContentItems.length,
            itemCount: validation.itemCount,
            validationPassed: true,
            repairAttempted,
            paths: { dailyFilePath, dailyPagePath, monthDirectoryIndexPath },
        });
        console.log(`[Scheduled][Daily] Published successfully (${runId}).`);
        return {
            success: true,
            published: true,
            date: dateStr,
            runId,
            selectedCount: selectedContentItems.length,
            itemCount: validation.itemCount,
            repairAttempted,
        };

    } catch (error) {
        console.error(`[Scheduled][Daily] Error:`, error);
        const debugStack = dryRun
            ? String(error?.stack || '').split('\n').slice(0, 8).join('\n')
            : '';
        await recordStatus({
            state: publicationStarted ? 'partial' : 'failed',
            phase: publicationStarted ? 'publishing' : 'generation',
            progress: 100,
            error: error.message,
        });
        return {
            success: false,
            published: false,
            date: dateStr,
            runId,
            error: error.message,
            ...(debugStack ? { debugStack } : {}),
        };
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
