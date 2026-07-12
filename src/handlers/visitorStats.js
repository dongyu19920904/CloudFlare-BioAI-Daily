const DEFAULT_SITE = 'yuyu-home';
const VISITOR_ID_RE = /^[a-zA-Z0-9_-]{8,80}$/;
const SITE_RE = /^[a-z0-9-]{2,40}$/;
const VISITOR_TTL_SECONDS = 86400 * 365;
const ALLOWED_ORIGINS = new Set([
    'https://yuyu.aivora.cn',
    'http://localhost:4321',
    'http://127.0.0.1:4321',
]);

function corsHeaders(request) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://yuyu.aivora.cn';
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        Vary: 'Origin',
    };
}

function getShanghaiDate() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function hashVisitorId(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

async function readJson(kv, key, fallback) {
    const value = await kv.get(key);
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

export async function handleVisitorStats(request, env) {
    const headers = corsHeaders(request);
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), {
            status: 405,
            headers,
        });
    }
    if (!env.DATA_KV) {
        return new Response(JSON.stringify({ success: false, error: 'DATA_KV is not configured' }), {
            status: 500,
            headers,
        });
    }

    const url = new URL(request.url);
    const rawSite = (url.searchParams.get('site') || DEFAULT_SITE).toLowerCase();
    const site = SITE_RE.test(rawSite) ? rawSite : DEFAULT_SITE;
    const visitorId = url.searchParams.get('visitor') || '';
    const hasValidVisitor = VISITOR_ID_RE.test(visitorId);
    const today = getShanghaiDate();
    const now = new Date().toISOString();
    const totalKey = `visitor-stats:${site}:total`;
    const todayKey = `visitor-stats:${site}:daily:${today}`;

    const [totalStats, todayStats] = await Promise.all([
        readJson(env.DATA_KV, totalKey, { pageviews: 0, visitors: 0 }),
        readJson(env.DATA_KV, todayKey, { pageviews: 0, visitors: 0, date: today }),
    ]);

    totalStats.pageviews = Number(totalStats.pageviews || 0) + 1;
    todayStats.pageviews = Number(todayStats.pageviews || 0) + 1;
    totalStats.updatedAt = now;
    todayStats.updatedAt = now;
    todayStats.date = today;

    if (hasValidVisitor) {
        const visitorHash = hashVisitorId(`${site}:${visitorId}`);
        const visitorKey = `visitor-stats:${site}:visitor:${visitorHash}`;
        const dailyVisitorKey = `visitor-stats:${site}:daily:${today}:visitor:${visitorHash}`;
        const [seenVisitor, seenTodayVisitor] = await Promise.all([
            env.DATA_KV.get(visitorKey),
            env.DATA_KV.get(dailyVisitorKey),
        ]);
        if (!seenVisitor) totalStats.visitors = Number(totalStats.visitors || 0) + 1;
        if (!seenTodayVisitor) todayStats.visitors = Number(todayStats.visitors || 0) + 1;
        await Promise.all([
            env.DATA_KV.put(visitorKey, '1', { expirationTtl: VISITOR_TTL_SECONDS }),
            env.DATA_KV.put(dailyVisitorKey, '1', { expirationTtl: 86400 * 3 }),
        ]);
    }

    await Promise.all([
        env.DATA_KV.put(totalKey, JSON.stringify(totalStats)),
        env.DATA_KV.put(todayKey, JSON.stringify(todayStats), { expirationTtl: 86400 * 31 }),
    ]);

    return new Response(JSON.stringify({
        success: true,
        site,
        total: {
            pageviews: totalStats.pageviews,
            visitors: Number(totalStats.visitors || 0),
        },
        today: {
            date: today,
            pageviews: todayStats.pageviews,
            visitors: Number(todayStats.visitors || 0),
        },
        updatedAt: now,
    }), { status: 200, headers });
}
