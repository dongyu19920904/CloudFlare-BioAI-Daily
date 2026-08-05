import {
    buildDailyCandidateIdentity,
    classifySourceTier,
    getDailyCandidateDedupeKeys,
    normalizeCanonicalUrl,
} from './bioDailyEvidence.js';

function parsePositiveInteger(value, defaultValue) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

const DEFAULT_SOURCE_CAPS = {
    news: 4,
    paper: 3,
    project: 1,
    socialMedia: 1,
};

const DEFAULT_POOL_CAPS = {
    research: 3,
    tool: 2,
    industry: 2,
    project: 1,
    fun: 1,
};

const SOURCE_CAP_ENV_KEYS = {
    news: 'DAILY_NEWS_ITEM_CAP',
    paper: 'DAILY_PAPER_ITEM_CAP',
    project: 'DAILY_PROJECT_ITEM_CAP',
    socialMedia: 'DAILY_SOCIAL_ITEM_CAP',
};

const POOL_CAP_ENV_KEYS = {
    research: 'DAILY_RESEARCH_POOL_CAP',
    tool: 'DAILY_TOOL_POOL_CAP',
    industry: 'DAILY_INDUSTRY_POOL_CAP',
    project: 'DAILY_OPEN_SOURCE_POOL_CAP',
    fun: 'DAILY_FUN_POOL_CAP',
};

const BIO_RELEVANCE_PATTERN = /\b(?:aging|ageing|longevity|healthspan|lifespan|geroscience|frailty|sarcopenia|dementia|alzheimer(?:'s)?|neurodegener\w*|inflammaging|immunosenesc\w*|senesc\w*|rejuven\w*)\b|\b(?:biological age|epigenetic clock|aging clock|brain age)\b|衰老|长寿|延寿|健康寿命|生物年龄|表观遗传时钟|衰老时钟|脑龄|衰弱|肌少症|痴呆|阿尔茨海默|神经退行|炎症性衰老|免疫衰老/i;
const OUT_OF_SCOPE_AGE_PATTERN = /\b(?:forensic|dental|skeletal|bone) age(?: estimation)?\b/i;
const TOOL_PATTERN = /tool|platform|software|pipeline|benchmark|dataset|model|github|open source|开源|工具|平台|软件|流程|基准|数据集|模型/i;
const INDUSTRY_PATTERN = /regulat|policy|approval|funding|company|industry|launch|FDA|WHO|NMPA|监管|政策|批准|融资|公司|行业|推出/i;

function getCandidateEditorialText(candidate = {}) {
    return [candidate.title, candidate.description].filter(Boolean).join(' ');
}

function getCandidatePublisherKey(candidate = {}) {
    const identity = buildDailyCandidateIdentity(candidate);
    if (identity.doi) return `doi:${identity.doi.split('/')[0]}`;
    if (identity.repo) return `github:${identity.repo.split('/')[0]}`;
    try {
        return new URL(normalizeCanonicalUrl(candidate.url)).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return String(candidate.source || 'unknown').toLowerCase().trim() || 'unknown';
    }
}

export function resolveDailyPromptItemCap(env = {}, isManualRun = false) {
    const manualCap = isManualRun ? env.MANUAL_DAILY_PROMPT_ITEM_CAP : null;
    return Math.min(parsePositiveInteger(manualCap || env.DAILY_PROMPT_ITEM_CAP, 8), 8);
}

export function resolveDailyMinimumItemCount(env = {}) {
    return Math.min(parsePositiveInteger(env.DAILY_MIN_PUBLISH_ITEMS, 5), 8);
}

export function selectDailyPromptItems(itemsWithMedia = [], itemsWithoutMedia = [], cap = 8) {
    const normalizedCap = Math.min(parsePositiveInteger(cap, 8), 8);
    return [...itemsWithMedia, ...itemsWithoutMedia].slice(0, normalizedCap);
}

export function resolveDailySourceCaps(env = {}) {
    return Object.fromEntries(
        Object.entries(DEFAULT_SOURCE_CAPS).map(([sourceType, fallback]) => [
            sourceType,
            parsePositiveInteger(env[SOURCE_CAP_ENV_KEYS[sourceType]], fallback),
        ])
    );
}

export function resolveDailyPoolCaps(env = {}) {
    return Object.fromEntries(
        Object.entries(DEFAULT_POOL_CAPS).map(([pool, fallback]) => [
            pool,
            parsePositiveInteger(env[POOL_CAP_ENV_KEYS[pool]], fallback),
        ])
    );
}

export function classifyDailyCandidatePool(candidate = {}) {
    const sourceType = candidate.sourceType || candidate.type;
    const text = getCandidateEditorialText(candidate);
    if (sourceType === 'paper') return 'research';
    if (sourceType === 'project') return 'project';
    if (sourceType === 'socialMedia') return 'fun';
    if (TOOL_PATTERN.test(text) && BIO_RELEVANCE_PATTERN.test(text)) return 'tool';
    if (INDUSTRY_PATTERN.test(text)) return 'industry';
    if (BIO_RELEVANCE_PATTERN.test(text)) return 'research';
    return 'industry';
}

export function isBioDailyRelevant(candidate = {}) {
    const text = getCandidateEditorialText(candidate);
    const title = String(candidate.title || '');
    if (OUT_OF_SCOPE_AGE_PATTERN.test(text) && !/\b(?:biological age|brain age|epigenetic clock|aging clock)\b/i.test(text)) {
        return false;
    }
    if (candidate.sourceType === 'paper' || candidate.sourceType === 'news' || candidate.sourceType === 'socialMedia') {
        return BIO_RELEVANCE_PATTERN.test(title);
    }
    if (candidate.sourceType === 'project') {
        return BIO_RELEVANCE_PATTERN.test(text);
    }
    return BIO_RELEVANCE_PATTERN.test(text) || (TOOL_PATTERN.test(text) && /bio|medical|health|clinical|生命|医学|健康|临床/i.test(text));
}

function candidateSortScore(candidate) {
    const tier = classifySourceTier(candidate).tier;
    const tierScore = { A: 40, B: 28, C: 15, D: 0 }[tier] || 0;
    const publishedAt = new Date(candidate?.publishedDate || candidate?.published_date || 0).getTime();
    const recencyScore = Number.isFinite(publishedAt) ? Math.max(0, Math.min(20, publishedAt / 1e12)) : 0;
    const bioScore = BIO_RELEVANCE_PATTERN.test(getCandidateEditorialText(candidate)) ? 30 : 0;
    const mediaScore = candidate?.hasMedia ? 2 : 0;
    return tierScore + recencyScore + bioScore + mediaScore;
}

function sortCandidates(candidates = []) {
    return [...candidates].sort((a, b) => {
        const scoreDelta = candidateSortScore(b) - candidateSortScore(a);
        if (scoreDelta !== 0) return scoreDelta;
        return new Date(b?.publishedDate || 0).getTime() - new Date(a?.publishedDate || 0).getTime();
    });
}

function hasAcceptedMatch(candidate, acceptedKeys) {
    if (!acceptedKeys || acceptedKeys.size === 0) return false;
    return getDailyCandidateDedupeKeys(candidate).some((key) => acceptedKeys.has(key));
}

export function selectDailyPromptCandidates(candidates = [], env = {}, cap = 8, options = {}) {
    const normalizedCap = Math.min(parsePositiveInteger(cap, 8), 8);
    const sourceCaps = resolveDailySourceCaps(env);
    const poolCaps = resolveDailyPoolCaps(env);
    const publisherCap = parsePositiveInteger(env.DAILY_PUBLISHER_ITEM_CAP, 2);
    const acceptedKeys = options.acceptedKeys instanceof Set ? options.acceptedKeys : new Set(options.acceptedKeys || []);
    const selected = [];
    const selectedKeys = new Set();
    const sourceCounts = {};
    const poolCounts = {};
    const publisherCounts = {};

    const prepared = sortCandidates(candidates)
        .filter((candidate) => isBioDailyRelevant(candidate))
        .filter((candidate) => !hasAcceptedMatch(candidate, acceptedKeys))
        .map((candidate) => ({
            ...candidate,
            pool: candidate.pool || classifyDailyCandidatePool(candidate),
        }));

    const addCandidate = (candidate, enforcePoolCap = true) => {
        if (!candidate || selected.length >= normalizedCap) return false;
        const sourceType = candidate.sourceType || 'news';
        const pool = candidate.pool || classifyDailyCandidatePool(candidate);
        const publisher = getCandidatePublisherKey(candidate);
        if ((sourceCounts[sourceType] || 0) >= (sourceCaps[sourceType] || 0)) return false;
        if (enforcePoolCap && (poolCounts[pool] || 0) >= (poolCaps[pool] || 0)) return false;
        if ((publisherCounts[publisher] || 0) >= publisherCap) return false;

        const keys = getDailyCandidateDedupeKeys(candidate);
        if (keys.some((key) => selectedKeys.has(key))) return false;
        keys.forEach((key) => selectedKeys.add(key));
        selected.push(candidate);
        sourceCounts[sourceType] = (sourceCounts[sourceType] || 0) + 1;
        poolCounts[pool] = (poolCounts[pool] || 0) + 1;
        publisherCounts[publisher] = (publisherCounts[publisher] || 0) + 1;
        return true;
    };

    // Reserve the editorial mix before filling remaining slots by score.
    const poolOrder = ['research', 'tool', 'industry', 'project', 'fun'];
    for (const pool of poolOrder) {
        const candidate = prepared.find((item) => item.pool === pool && !selected.includes(item));
        if (candidate) addCandidate(candidate);
    }

    for (const candidate of prepared) addCandidate(candidate);
    if (selected.length < normalizedCap) {
        for (const candidate of prepared) addCandidate(candidate, false);
    }

    return selected.slice(0, normalizedCap);
}
