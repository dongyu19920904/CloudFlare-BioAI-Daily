function toBoolean(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeMaxItems(value, fallback = 2) {
    const parsed = parseInt(String(value ?? ''), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    return fallback;
}

export function isLinuxDoUrl(url) {
    if (!url) return false;
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return hostname === 'linux.do' || hostname.endsWith('.linux.do');
    } catch {
        return false;
    }
}

export function stripMediaTags(html) {
    if (!html) return '';
    const input = String(html);
    // Remove image and video tags to avoid broken media from anti-hotlink sources.
    return input
        .replace(/<img\b[^>]*>/gi, '')
        .replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, '')
        .replace(/<video\b[^>]*\/>/gi, '');
}

export function resolveLinuxDoPolicy(env) {
    return {
        maxItems: normalizeMaxItems(env?.LINUXDO_MAX_ITEMS, 2),
        stripMedia: !toBoolean(env?.LINUXDO_KEEP_MEDIA),
    };
}

export function applyLinuxDoPolicy(items, policy = {}) {
    const maxItems = normalizeMaxItems(policy.maxItems, 2);
    const stripMedia = policy.stripMedia !== false;
    let linuxCount = 0;
    const output = [];

    for (const item of items || []) {
        if (!item || typeof item !== 'object') continue;

        if (!isLinuxDoUrl(item.url)) {
            output.push(item);
            continue;
        }

        linuxCount += 1;
        if (linuxCount > maxItems) continue;

        if (!stripMedia || !item.details || typeof item.details.content_html !== 'string') {
            output.push(item);
            continue;
        }

        output.push({
            ...item,
            details: {
                ...item.details,
                content_html: stripMediaTags(item.details.content_html),
            },
        });
    }

    return output;
}

