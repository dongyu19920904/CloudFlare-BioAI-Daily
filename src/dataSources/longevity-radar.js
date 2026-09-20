import { escapeHtml, stripHtml } from '../helpers.js';

const DEFAULT_RADAR_URL = 'https://radar.aibioo.cn/data/briefing-lite.json';

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isEnabled(value) {
    return String(value ?? 'true').trim().toLowerCase() !== 'false';
}

function safeHttpUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch {
        return '';
    }
}

function resolveItemType(sourceType) {
    if (sourceType === 'paper') return 'paper';
    if (sourceType === 'project') return 'project';
    return 'news';
}

function buildDescription(item) {
    return [
        item.selection_reason,
        item.primary_topic ? `主题: ${item.primary_topic}` : '',
        item.study_subject ? `研究对象: ${item.study_subject}` : '',
        item.publication_stage ? `发表阶段: ${item.publication_stage}` : '',
        Array.isArray(item.risk_flags) && item.risk_flags.length > 0
            ? `风险标记: ${item.risk_flags.join(', ')}`
            : '',
    ].filter(Boolean).join('；');
}

const LongevityRadarDataSource = {
    type: 'longevity-radar',

    async fetch(env = {}) {
        if (!isEnabled(env.LONGEVITY_RADAR_ENABLED)) {
            return { items: [] };
        }

        const url = safeHttpUrl(env.LONGEVITY_RADAR_API_URL || DEFAULT_RADAR_URL);
        if (!url) {
            console.warn('[longevity-radar] Invalid LONGEVITY_RADAR_API_URL. Skipping source.');
            return { items: [] };
        }

        const timeoutMs = parsePositiveInteger(env.DATA_SOURCE_FETCH_TIMEOUT_MS, 20000);
        const maxItems = parsePositiveInteger(env.LONGEVITY_RADAR_MAX_ITEMS, 8);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);

        try {
            const response = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'BioAI-Daily-Worker/1.0',
                },
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const payload = await response.json();
            if (payload?.schema_version !== 'bio-radar-v1' || !Array.isArray(payload.items)) {
                throw new Error('Unsupported radar payload');
            }

            const items = payload.items
                .filter((item) => item && safeHttpUrl(item.url) && item.title)
                .slice(0, maxItems);
            console.log(`[longevity-radar] Loaded ${items.length} curated signals from ${url}.`);
            return { items };
        } catch (error) {
            console.warn(`[longevity-radar] Failed to fetch ${url}: ${error.message}`);
            return { items: [] };
        } finally {
            clearTimeout(timeoutId);
        }
    },

    transform(rawData) {
        if (!rawData || !Array.isArray(rawData.items)) return [];

        return rawData.items.map((item) => {
            const description = buildDescription(item);
            const title = item.title_zh || item.title || item.title_en;
            const url = safeHttpUrl(item.url);

            return {
                id: item.id || url,
                type: resolveItemType(item.source_type),
                url,
                title,
                description,
                published_date: item.published_at || '',
                authors: item.source || 'AI生命延续学雷达',
                source: `AI生命延续学雷达 · ${item.source || '公开来源'}`,
                details: {
                    content_html: `<p>${escapeHtml(description)}</p>`,
                    canonicalUrl: url,
                    radarSchemaVersion: 'bio-radar-v1',
                    sourceType: item.source_type || 'unknown',
                    signalScore: item.signal_score,
                    relevanceTier: item.relevance_tier || 'unknown',
                    primaryTopic: item.primary_topic || 'unknown',
                    studySubject: item.study_subject || 'unknown',
                    publicationStage: item.publication_stage || 'unknown',
                    riskFlags: Array.isArray(item.risk_flags) ? item.risk_flags : [],
                },
            };
        }).filter((item) => item.url && item.title && stripHtml(item.title));
    },
};

export default LongevityRadarDataSource;
