import { escapeHtml, isDateWithinLastDays } from '../helpers.js';

const DEFAULT_ENDPOINT = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitQueries(value) {
    return String(value || '')
        .split('|')
        .map((query) => query.trim())
        .filter(Boolean);
}

function normalizePubTypes(result) {
    const values = result?.pubTypeList?.pubType || result?.pubType || [];
    return (Array.isArray(values) ? values : [values]).map(String).filter(Boolean);
}

function resultDate(result) {
    return result.firstPublicationDate
        || result.electronicPublicationDate
        || result.firstIndexDate
        || (result.pubYear ? `${result.pubYear}-01-01` : '');
}

function resultUrl(result) {
    if (result.doi) return `https://doi.org/${String(result.doi).toLowerCase()}`;
    if (result.pmid) return `https://europepmc.org/article/MED/${result.pmid}`;
    if (result.pmcid) return `https://europepmc.org/article/PMC/${String(result.pmcid).replace(/^PMC/i, '')}`;
    return result.id ? `https://europepmc.org/article/${result.source || 'MED'}/${result.id}` : 'https://europepmc.org/';
}

export function isBioAiResearchCandidate(result = {}) {
    const text = `${result.title || ''} ${result.abstractText || ''}`.replace(/<[^>]+>/g, ' ');
    const hasAiMethod = /artificial intelligence|machine learning|deep learning|neural network|foundation model|large language model|computer vision|explainable machine learning|\bAI\b/i.test(text);
    const hasLongevityContext = /aging|ageing|longevity|geroscience|biological age|epigenetic clock|methylation age|brain age|dementia|alzheimer|senescen|senolytic|rejuvenat|older adult|age-related|frailty|lifespan|healthspan|immunosenescence|inflammaging/i.test(text);
    return hasAiMethod && hasLongevityContext;
}

async function fetchQuery(endpoint, query, pageSize, timeoutMs) {
    const url = new URL(endpoint);
    url.searchParams.set('query', `${query} sort_date:y`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('resultType', 'core');
    url.searchParams.set('pageSize', String(pageSize));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
        const response = await fetch(url.toString(), {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'BioAI-Daily-Worker/1.0 (news.aibioo.cn)',
            },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        return payload?.resultList?.result || [];
    } finally {
        clearTimeout(timeoutId);
    }
}

export const EuropePmcDataSource = {
    type: 'europe-pmc',

    async fetch(env = {}) {
        const queries = splitQueries(env.EUROPEPMC_LONGEVITY_QUERIES);
        const maxQueries = parsePositiveInteger(env.EUROPEPMC_MAX_QUERIES_PER_RUN, 2);
        const pageSize = Math.min(parsePositiveInteger(env.EUROPEPMC_FETCH_RESULTS, 12), 50);
        const filterDays = parsePositiveInteger(env.EUROPEPMC_FETCH_DAYS, 30);
        const timeoutMs = parsePositiveInteger(env.DATA_SOURCE_FETCH_TIMEOUT_MS, 20000);
        const endpoint = env.EUROPEPMC_API_URL || DEFAULT_ENDPOINT;
        const selectedQueries = queries.slice(0, maxQueries);
        if (selectedQueries.length === 0) {
            console.warn('[europe-pmc] EUROPEPMC_LONGEVITY_QUERIES is empty. Skipping.');
            return { items: [] };
        }

        const results = await Promise.all(selectedQueries.map(async (query) => {
            try {
                return await fetchQuery(endpoint, query, pageSize, timeoutMs);
            } catch (error) {
                console.warn(`[europe-pmc] Query failed: ${error.message}`);
                return [];
            }
        }));

        const items = [];
        const seen = new Set();
        for (const result of results.flat()) {
            const date = resultDate(result);
            if (!date || !isDateWithinLastDays(date, filterDays)) continue;
            if (!isBioAiResearchCandidate(result)) continue;
            const key = String(result.doi || result.pmid || result.pmcid || result.id || '').toLowerCase();
            if (!key || seen.has(key) || !result.title) continue;
            seen.add(key);
            items.push({ ...result, _publishedDate: date, _url: resultUrl(result) });
        }
        console.log(`[europe-pmc] Collected ${items.length} recent unique papers from ${selectedQueries.length} queries.`);
        return { items };
    },

    transform(rawData, sourceType = 'paper') {
        if (!Array.isArray(rawData?.items)) return [];
        return rawData.items.map((result) => {
            const pubTypes = normalizePubTypes(result);
            const isPreprint = String(result.source || '').toUpperCase() === 'PPR'
                || pubTypes.some((value) => /preprint/i.test(value));
            const abstractText = String(result.abstractText || '').trim();
            return {
                id: result.doi || result.pmid || result.pmcid || result.id,
                type: sourceType,
                url: result._url,
                title: result.title,
                description: abstractText,
                published_date: result._publishedDate,
                authors: result.authorString || '未报告',
                source: result.journalTitle || 'Europe PMC',
                details: {
                    content_html: abstractText ? `<p>${escapeHtml(abstractText)}</p>` : '',
                    abstractText,
                    primarySourceUrl: result._url,
                    sourceAuthority: '一手/官方',
                    doi: result.doi || '',
                    pmid: result.pmid || '',
                    pmcid: result.pmcid || '',
                    pubTypes,
                    journalTitle: result.journalTitle || '',
                    publicationStatus: result.publicationStatus || '',
                    isPreprint,
                    peerReviewStatus: isPreprint ? '预印本/未同行评审' : '已发表（同行评审状态以期刊记录为准）',
                },
            };
        });
    },
};

export default EuropePmcDataSource;
