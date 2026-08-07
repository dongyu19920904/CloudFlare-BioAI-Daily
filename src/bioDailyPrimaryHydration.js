import { buildDailyCandidateIdentity, normalizeCanonicalUrl } from './bioDailyEvidence.js';

const EUROPE_PMC_SEARCH_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function publicationTypes(item) {
    const values = item?.pubTypeList?.pubType;
    if (Array.isArray(values)) return values;
    return typeof values === 'string' ? [values] : [];
}

function truncateText(value, maxChars = 1400) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

async function fetchPrimaryRecordByDoi(doi, fetchImpl) {
    const url = new URL(EUROPE_PMC_SEARCH_URL);
    url.searchParams.set('query', `DOI:${doi}`);
    url.searchParams.set('resultType', 'core');
    url.searchParams.set('format', 'json');
    url.searchParams.set('pageSize', '3');
    const response = await fetchImpl(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'BioAI-Daily-Worker/1.0 (news.aibioo.cn)',
        },
    });
    if (!response.ok) throw new Error(`Europe PMC DOI lookup failed with HTTP ${response.status}`);
    const payload = await response.json();
    return (payload?.resultList?.result || []).find((item) => String(item?.doi || '').toLowerCase() === doi) || null;
}

export async function hydrateDailyPrimaryEvidence(candidates = [], env = {}, fetchImpl = fetch) {
    const lookupCap = Math.min(positiveInteger(env.DAILY_PRIMARY_HYDRATION_CAP, 2), 3);
    const lookupIndexes = new Set(candidates
        .map((candidate, index) => ({ candidate, index, identity: buildDailyCandidateIdentity(candidate) }))
        .filter(({ candidate, identity }) => candidate?.sourceType === 'news'
            && (!candidate?.pool || candidate.pool === 'research')
            && Boolean(identity.doi))
        .slice(0, lookupCap)
        .map(({ index }) => index));
    const hydrated = [];

    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const identity = buildDailyCandidateIdentity(candidate);
        if (!lookupIndexes.has(index)) {
            hydrated.push(candidate);
            continue;
        }

        try {
            const record = await fetchPrimaryRecordByDoi(identity.doi, fetchImpl);
            const abstract = truncateText(record?.abstractText);
            if (!record || !abstract) {
                console.warn(`[BioDaily] Primary DOI hydration returned no abstract for ${identity.doi}.`);
                hydrated.push(candidate);
                continue;
            }
            const types = publicationTypes(record);
            const isPreprint = String(record.source || '').toUpperCase() === 'PPR'
                || types.some((type) => /preprint/i.test(type));
            const primaryUrl = `https://doi.org/${identity.doi}`;
            hydrated.push({
                ...candidate,
                sourceType: 'paper',
                url: primaryUrl,
                primaryUrl,
                title: record.title || candidate.title,
                description: abstract,
                contentText: abstract,
                source: 'Europe PMC',
                publishedDate: record.firstPublicationDate || record.electronicPublicationDate || candidate.publishedDate,
                details: {
                    ...(candidate.details || {}),
                    discoveryUrl: normalizeCanonicalUrl(candidate?.details?.discoveryUrl || candidate.url),
                    content_html: `<p>${abstract}</p>`,
                    doi: identity.doi,
                    pmid: record.pmid || '',
                    pmcid: record.pmcid || '',
                    journal: record.journalTitle || record?.journalInfo?.journal?.title || record?.journalInfo?.journal?.medlineAbbreviation || '',
                    publicationTypes: types,
                    publicationStatus: isPreprint ? 'preprint' : 'journal record',
                    sourceDatabase: record.source || '',
                    primaryEvidence: {
                        title: record.title || candidate.title,
                        source: 'Europe PMC',
                        contentText: abstract,
                    },
                },
            });
            console.log(`[BioDaily] Hydrated selected DOI ${identity.doi} from Europe PMC.`);
        } catch (error) {
            console.warn(`[BioDaily] Primary DOI hydration failed for ${identity.doi}: ${error.message}`);
            hydrated.push(candidate);
        }
    }

    return hydrated;
}
