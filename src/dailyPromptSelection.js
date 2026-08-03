function parsePositiveInteger(value, defaultValue) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function clampDailyCap(value) {
    return Math.max(3, Math.min(8, parsePositiveInteger(value, 8)));
}

const DEFAULT_SOURCE_CAPS = {
    news: 3,
    paper: 6,
    project: 2,
    socialMedia: 1,
};

const SOURCE_CAP_ENV_KEYS = {
    news: 'DAILY_NEWS_ITEM_CAP',
    paper: 'DAILY_PAPER_ITEM_CAP',
    project: 'DAILY_PROJECT_ITEM_CAP',
    socialMedia: 'DAILY_SOCIAL_ITEM_CAP',
};

export function resolveDailyPromptItemCap(env = {}, isManualRun = false) {
    const manualCap = isManualRun ? env.MANUAL_DAILY_PROMPT_ITEM_CAP : null;
    return clampDailyCap(manualCap || env.DAILY_PROMPT_ITEM_CAP);
}

export function selectDailyPromptItems(itemsWithMedia = [], itemsWithoutMedia = [], cap = 8) {
    return [...itemsWithMedia, ...itemsWithoutMedia].slice(0, clampDailyCap(cap));
}

export function resolveDailySourceCaps(env = {}) {
    return Object.fromEntries(
        Object.entries(DEFAULT_SOURCE_CAPS).map(([sourceType, fallback]) => [
            sourceType,
            parsePositiveInteger(env[SOURCE_CAP_ENV_KEYS[sourceType]], fallback),
        ])
    );
}

function candidateDateScore(candidate) {
    const timestamp = new Date(candidate?.publishedDate || 0).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
    const ageDays = Math.max(0, (Date.now() - timestamp) / 86400000);
    return Math.max(0, 10 - Math.min(ageDays, 10));
}

function candidateScore(candidate) {
    const editorialScore = Number(candidate?.editorial?.qualityScore || candidate?.qualityScore || 0);
    const primarySourceBonus = candidate?.editorial?.sourceAuthority === '一手/官方' ? 8 : 0;
    const mediaBonus = candidate?.hasMedia ? 1 : 0;
    return editorialScore + primarySourceBonus + candidateDateScore(candidate) + mediaBonus;
}

function sortCandidates(candidates = []) {
    return [...candidates].sort((a, b) => {
        const scoreDifference = candidateScore(b) - candidateScore(a);
        if (scoreDifference !== 0) return scoreDifference;
        return new Date(b?.publishedDate || 0).getTime() - new Date(a?.publishedDate || 0).getTime();
    });
}

export function selectDailyPromptCandidates(candidates = [], env = {}, cap = 8) {
    const normalizedCap = clampDailyCap(cap);
    const sourceCaps = resolveDailySourceCaps(env);
    const maxPerTopic = parsePositiveInteger(env.DAILY_MAX_ITEMS_PER_TOPIC, 2);
    const selected = [];
    const selectedKeys = new Set();
    const sourceCounts = {};
    const topicCounts = {};

    const addCandidate = (candidate) => {
        if (!candidate || selected.length >= normalizedCap) return false;
        const key = candidate.key || candidate.url || candidate.text;
        const sourceType = candidate.sourceType || 'unknown';
        const topicKey = candidate.editorial?.topicKey || candidate.topicKey || 'other';
        if (!key || selectedKeys.has(key)) return false;
        if ((sourceCounts[sourceType] || 0) >= (sourceCaps[sourceType] || 0)) return false;
        if ((topicCounts[topicKey] || 0) >= maxPerTopic) return false;
        selectedKeys.add(key);
        sourceCounts[sourceType] = (sourceCounts[sourceType] || 0) + 1;
        topicCounts[topicKey] = (topicCounts[topicKey] || 0) + 1;
        selected.push(candidate);
        return true;
    };

    const ranked = sortCandidates(candidates);

    // A daily issue should normally include both a research record and a current event
    // when trustworthy candidates are available. Projects and social posts compete on quality.
    for (const requiredSource of ['paper', 'news']) {
        addCandidate(ranked.find((candidate) => candidate.sourceType === requiredSource));
    }

    for (const candidate of ranked) addCandidate(candidate);

    return sortCandidates(selected).slice(0, normalizedCap);
}
