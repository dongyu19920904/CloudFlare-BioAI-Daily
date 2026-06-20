function parsePositiveInteger(value, defaultValue) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

const DEFAULT_SOURCE_CAPS = {
    news: 8,
    paper: 8,
    project: 4,
    socialMedia: 2,
};

const SOURCE_CAP_ENV_KEYS = {
    news: 'DAILY_NEWS_ITEM_CAP',
    paper: 'DAILY_PAPER_ITEM_CAP',
    project: 'DAILY_PROJECT_ITEM_CAP',
    socialMedia: 'DAILY_SOCIAL_ITEM_CAP',
};

export function resolveDailyPromptItemCap(env = {}, isManualRun = false) {
    const manualCap = isManualRun ? env.MANUAL_DAILY_PROMPT_ITEM_CAP : null;
    return parsePositiveInteger(manualCap || env.DAILY_PROMPT_ITEM_CAP, 8);
}

export function selectDailyPromptItems(itemsWithMedia = [], itemsWithoutMedia = [], cap = 8) {
    const normalizedCap = parsePositiveInteger(cap, 8);
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

function candidateSortKey(candidate) {
    const dateTime = new Date(candidate?.publishedDate || 0).getTime();
    return Number.isFinite(dateTime) ? dateTime : 0;
}

function sortCandidates(candidates = []) {
    return [...candidates].sort((a, b) => {
        if (Boolean(a?.hasMedia) !== Boolean(b?.hasMedia)) {
            return a?.hasMedia ? -1 : 1;
        }
        return candidateSortKey(b) - candidateSortKey(a);
    });
}

export function selectDailyPromptCandidates(candidates = [], env = {}, cap = 8) {
    const normalizedCap = parsePositiveInteger(cap, 8);
    const sourceCaps = resolveDailySourceCaps(env);
    const sourceOrder = ['news', 'paper', 'project', 'socialMedia'];
    const selected = [];
    const selectedKeys = new Set();

    const addCandidate = (candidate) => {
        if (!candidate || selected.length >= normalizedCap) return false;
        const key = candidate.key || candidate.url || candidate.text;
        if (!key || selectedKeys.has(key)) return false;
        selectedKeys.add(key);
        selected.push(candidate);
        return true;
    };

    for (const sourceType of sourceOrder) {
        const sourceCap = sourceCaps[sourceType] || 0;
        if (sourceCap <= 0) continue;
        const sourceCandidates = sortCandidates(
            candidates.filter((candidate) => candidate?.sourceType === sourceType)
        ).slice(0, sourceCap);
        for (const candidate of sourceCandidates) {
            addCandidate(candidate);
        }
    }

    if (selected.length < normalizedCap) {
        const remaining = sortCandidates(candidates)
            .filter((candidate) => {
                const sourceType = candidate?.sourceType;
                if (sourceType !== 'paper') return true;
                const paperSelectedCount = selected.filter((item) => item.sourceType === 'paper').length;
                return paperSelectedCount < sourceCaps.paper;
            });
        for (const candidate of remaining) {
            addCandidate(candidate);
        }
    }

    return selected.slice(0, normalizedCap);
}
