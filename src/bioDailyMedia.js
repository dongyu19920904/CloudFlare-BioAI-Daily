import { classifySourceTier, normalizeCanonicalUrl, resolveDailyPrimarySource } from './bioDailyEvidence.js';

const SUPPORTED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
]);

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeHtml(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function isPrivateHostname(hostname) {
    const value = String(hostname || '').toLowerCase();
    if (!value || value === 'localhost' || value === '::1' || value.endsWith('.local')) return true;
    if (/^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value)) return true;
    const match = value.match(/^172\.(\d{1,3})\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

export function normalizeDailyMediaUrl(value, baseUrl = '') {
    const raw = decodeHtml(value).trim();
    if (!raw || /^(?:data|blob|javascript):/i.test(raw)) return '';
    try {
        const url = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
        if (!/^https?:$/.test(url.protocol) || isPrivateHostname(url.hostname)) return '';
        url.hash = '';
        return url.toString();
    } catch {
        return '';
    }
}

function collectMatches(html, pattern, groupIndex = 1) {
    const values = [];
    let match;
    while ((match = pattern.exec(String(html || ''))) !== null) values.push(match[groupIndex]);
    return values;
}

export function extractDailyMediaUrlsFromHtml(html, baseUrl = '') {
    const input = String(html || '');
    const values = [
        ...collectMatches(input, /<img\b[^>]*(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/gi),
        ...collectMatches(input, /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi),
        ...collectMatches(input, /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi),
    ];
    return [...new Set(values.map((value) => normalizeDailyMediaUrl(value, baseUrl)).filter(Boolean))];
}

export function extractDailyMediaCandidates(item = {}) {
    const baseUrl = item.url || '';
    const explicit = [
        item.imageUrl,
        item.mediaUrl,
        item.thumbnail,
        item?.details?.imageUrl,
        item?.details?.mediaUrl,
        item?.details?.thumbnail,
    ];
    const embedded = extractDailyMediaUrlsFromHtml(item?.details?.content_html || '', baseUrl);
    return [...new Set([...explicit.map((value) => normalizeDailyMediaUrl(value, baseUrl)), ...embedded].filter(Boolean))];
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
        return await fetchImpl(url, { ...options, signal: controller.signal, redirect: 'follow' });
    } finally {
        clearTimeout(timer);
    }
}

async function probeImage(url, fetchImpl, timeoutMs) {
    const headers = { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.1' };
    let response;
    try {
        response = await fetchWithTimeout(fetchImpl, url, { method: 'HEAD', headers }, timeoutMs);
    } catch {
        response = null;
    }
    if (!response?.ok || !SUPPORTED_IMAGE_TYPES.has(String(response.headers.get('content-type') || '').split(';')[0].toLowerCase())) {
        try {
            response = await fetchWithTimeout(fetchImpl, url, {
                method: 'GET',
                headers: { ...headers, Range: 'bytes=0-2047' },
            }, timeoutMs);
        } catch {
            return false;
        }
    }
    if (!response.ok) return false;
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!SUPPORTED_IMAGE_TYPES.has(contentType)) return false;
    const contentLength = Number(response.headers.get('content-length') || 0);
    return !Number.isFinite(contentLength) || contentLength === 0 || contentLength >= 4096;
}

async function discoverPageMedia(candidate, fetchImpl, timeoutMs) {
    const pageUrl = resolveDailyPrimarySource(candidate) || normalizeCanonicalUrl(candidate?.url);
    if (!pageUrl || classifySourceTier({ ...candidate, url: pageUrl }).tier !== 'A') return [];
    try {
        const response = await fetchWithTimeout(fetchImpl, pageUrl, {
            method: 'GET',
            headers: {
                Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
                'User-Agent': 'BioAI-Daily-Worker/1.0 (news.aibioo.cn)',
            },
        }, timeoutMs);
        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!response.ok || !contentType.includes('text/html')) return [];
        return extractDailyMediaUrlsFromHtml(await response.text(), response.url || pageUrl);
    } catch {
        return [];
    }
}

export async function prepareDailyCandidatesMedia(candidates = [], env = {}, fetchImpl = fetch) {
    const maxMedia = Math.min(parsePositiveInteger(env.DAILY_MEDIA_MAX_PER_ISSUE, 4), 4);
    const discoveryCap = Math.min(parsePositiveInteger(env.DAILY_MEDIA_DISCOVERY_CAP, 4), 6);
    const timeoutMs = Math.min(parsePositiveInteger(env.DAILY_MEDIA_FETCH_TIMEOUT_MS, 4500), 10000);
    const used = new Set();
    let discoveredPages = 0;
    let acceptedCount = 0;
    const prepared = [];

    for (const candidate of candidates) {
        let mediaCandidates = [...new Set(candidate.mediaCandidates || [])];
        if (mediaCandidates.length === 0 && discoveredPages < discoveryCap && acceptedCount < maxMedia) {
            discoveredPages += 1;
            mediaCandidates = await discoverPageMedia(candidate, fetchImpl, timeoutMs);
        }

        const media = [];
        for (const mediaUrl of mediaCandidates) {
            const normalized = normalizeDailyMediaUrl(mediaUrl, candidate.url);
            if (!normalized || used.has(normalized) || acceptedCount >= maxMedia) continue;
            if (!await probeImage(normalized, fetchImpl, timeoutMs)) continue;
            used.add(normalized);
            acceptedCount += 1;
            media.push({
                url: normalized,
                alt: String(candidate.title || '研究相关图像').replace(/[\[\]"]/g, '').trim(),
                source: String(candidate.source || '原始来源').replace(/[\[\]"]/g, '').trim(),
                sourceUrl: resolveDailyPrimarySource(candidate) || normalizeCanonicalUrl(candidate.url),
            });
            break;
        }

        prepared.push({
            ...candidate,
            media,
            mediaUrl: media[0]?.url || '',
            hasMedia: media.length > 0,
        });
    }

    return prepared;
}
