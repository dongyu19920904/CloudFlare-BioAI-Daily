function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveBudget(env, dailyKey, sharedKey, fallback) {
    const dailyBudget = positiveInteger(env?.[dailyKey], fallback);
    const sharedBudget = positiveInteger(env?.[sharedKey], fallback);
    return String(Math.min(dailyBudget, sharedBudget));
}

/**
 * Ordinary daily runs use a bounded source fan-out so evidence and media checks
 * cannot exhaust Cloudflare's external subrequest budget. Opportunity jobs keep
 * the shared source configuration and are intentionally unaffected.
 */
export function buildBioDailySourceEnv(env = {}) {
    return {
        ...env,
        LONGEVITY_NEWS_MAX_FEEDS_PER_RUN: resolveBudget(
            env,
            'DAILY_NEWS_MAX_FEEDS_PER_RUN',
            'LONGEVITY_NEWS_MAX_FEEDS_PER_RUN',
            6
        ),
        LONGEVITY_SOCIAL_MAX_FEEDS_PER_RUN: resolveBudget(
            env,
            'DAILY_SOCIAL_MAX_FEEDS_PER_RUN',
            'LONGEVITY_SOCIAL_MAX_FEEDS_PER_RUN',
            2
        ),
        PAPERS_COOL_MAX_FEEDS_PER_RUN: resolveBudget(
            env,
            'DAILY_PAPERS_COOL_MAX_FEEDS_PER_RUN',
            'PAPERS_COOL_MAX_FEEDS_PER_RUN',
            2
        ),
        EUROPEPMC_MAX_QUERIES_PER_RUN: resolveBudget(
            env,
            'DAILY_EUROPEPMC_MAX_QUERIES_PER_RUN',
            'EUROPEPMC_MAX_QUERIES_PER_RUN',
            2
        ),
        PROJECT_MAX_QUERIES_PER_RUN: resolveBudget(
            env,
            'DAILY_PROJECT_MAX_QUERIES_PER_RUN',
            'PROJECT_MAX_QUERIES_PER_RUN',
            2
        ),
    };
}
