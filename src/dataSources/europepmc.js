import { getFetchDate, getISODate, isDateWithinLastDays } from '../helpers.js';

const API_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitQueries(value) {
    return String(value || '')
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean);
}

function resolveArticleUrl(item) {
    if (item?.doi) return `https://doi.org/${String(item.doi).toLowerCase()}`;
    if (item?.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`;
    if (item?.pmcid) return `https://europepmc.org/article/PMC/${item.pmcid}`;
    if (item?.source && item?.id) return `https://europepmc.org/article/${item.source}/${item.id}`;
    return '';
}

function publicationTypes(item) {
    const values = item?.pubTypeList?.pubType;
    if (Array.isArray(values)) return values;
    if (typeof values === 'string') return [values];
    return [];
}

export const EuropePmcDataSource = {
    type: 'europe-pmc',

    async fetch(env) {
        const queries = splitQueries(env.EUROPEPMC_LONGEVITY_QUERIES);
        const maxQueries = parsePositiveInteger(env.EUROPEPMC_MAX_QUERIES_PER_RUN, 2);
        const pageSize = Math.min(parsePositiveInteger(env.EUROPEPMC_FETCH_RESULTS, 12), 25);
        const filterDays = parsePositiveInteger(env.EUROPEPMC_FETCH_DAYS, 30);
        const selectedQueries = queries.slice(0, maxQueries);
        if (selectedQueries.length === 0) return { items: [] };

        const itemsByUrl = new Map();
        for (const query of selectedQueries) {
            const url = new URL(API_BASE);
            url.searchParams.set('query', `${query} sort_date:y`);
            url.searchParams.set('resultType', 'core');
            url.searchParams.set('format', 'json');
            url.searchParams.set('pageSize', String(pageSize));

            try {
                const response = await fetch(url, {
                    headers: {
                        Accept: 'application/json',
                        'User-Agent': 'BioAI-Daily-Worker/1.0 (news.aibioo.cn)',
                    },
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                for (const item of payload?.resultList?.result || []) {
                    const articleUrl = resolveArticleUrl(item);
                    const publishedAt = item.firstPublicationDate || item.electronicPublicationDate || `${item.pubYear || getISODate()}-01-01`;
                    if (!articleUrl || !isDateWithinLastDays(publishedAt, filterDays)) continue;
                    if (!itemsByUrl.has(articleUrl)) itemsByUrl.set(articleUrl, { ...item, articleUrl, publishedAt });
                }
            } catch (error) {
                console.warn(`[europe-pmc] Query failed: ${error.message}`);
            }
        }

        return { items: [...itemsByUrl.values()] };
    },

    transform(rawData, sourceType) {
        if (!Array.isArray(rawData?.items)) return [];
        return rawData.items.map((item) => {
            const types = publicationTypes(item);
            const isPreprint = String(item.source || '').toUpperCase() === 'PPR' || types.some((type) => /preprint/i.test(type));
            return {
                id: item.id || item.pmid || item.doi,
                type: sourceType,
                url: item.articleUrl,
                title: item.title || 'Untitled Europe PMC record',
                description: item.abstractText || '',
                published_date: item.publishedAt,
                authors: item.authorString || 'Unknown',
                source: 'Europe PMC',
                details: {
                    content_html: `<p>${item.abstractText || ''}</p>`,
                    doi: item.doi || '',
                    pmid: item.pmid || '',
                    pmcid: item.pmcid || '',
                    journal: item.journalTitle || item?.journalInfo?.journal?.title || item?.journalInfo?.journal?.medlineAbbreviation || '',
                    publicationTypes: types,
                    publicationStatus: isPreprint ? 'preprint' : 'journal record',
                    sourceDatabase: item.source || '',
                    fetchedForDate: getFetchDate(),
                },
            };
        });
    },
};

export default EuropePmcDataSource;
