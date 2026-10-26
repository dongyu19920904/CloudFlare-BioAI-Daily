import { getReferencedSourceUrls } from './blogMedia.js';

const ARTICLE_PATHS = {
    'news.mit.edu': /^\/\d{4}\/[a-z0-9-]+$/i,
    'picower.mit.edu': /^\/news\/[a-z0-9-]+\/?$/i,
    'www.genengnews.com': /^\/topics\/[a-z0-9/-]+\/$/i,
    'www.sciencedaily.com': /^\/releases\/\d{4}\/\d{2}\/\d+\.htm$/i,
};

function decode(value) {
    return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function safeBioDailyImage(value) {
    try {
        const url = new URL(decode(value));
        if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')
            || /^[\d.]+$/.test(url.hostname) || url.hostname.endsWith('.local')
            || /(?:^|[/_.-])(?:logo|icon|avatar|pixel|spacer|tracking|banner)(?:[/_.-]|$)/i.test(url.pathname)
            || !/\.(?:png|jpe?g|webp|gif|avif)$/i.test(url.pathname)) return '';
        return url.href;
    } catch { return ''; }
}

function articleUrl(value) {
    try {
        const url = new URL(decode(value));
        return url.protocol === 'https:' && !url.username && !url.password && !url.port
            && !url.search && !url.hash && ARTICLE_PATHS[url.hostname]?.test(url.pathname) ? url.href : '';
    } catch { return ''; }
}

function attributes(tag) {
    return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(match => [match[1].toLowerCase(), decode(match[2])]));
}

function articleImage(html, source) {
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const attrs = attributes(tag);
        if (attrs.property?.toLowerCase() !== 'og:image' && attrs.name?.toLowerCase() !== 'twitter:image') continue;
        let absolute;
        try { absolute = new URL(attrs.content, source).href; } catch { continue; }
        const image = safeBioDailyImage(absolute);
        // Only the institution's own article media, never social cards or ad CDNs.
        if (image && new URL(image).hostname === new URL(source).hostname
            && /\/(?:sites\/default\/files|wp-content\/uploads|images)\//.test(new URL(image).pathname)) return image;
    }
    return '';
}

async function readArticle(fetcher, url, deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(3000, deadline - Date.now())));
    try {
        const response = await fetcher(url, { redirect: 'manual', signal: controller.signal,
            headers: { Accept: 'text/html', 'User-Agent': 'BioAI-Daily/1.0 (article image metadata)' } });
        if (!response.ok || response.redirected || !/text\/html/i.test(response.headers.get('content-type') || '')
            || Number(response.headers.get('content-length') || 0) > 350000) return '';
        const reader = response.body?.getReader();
        if (!reader) return '';
        const decoder = new TextDecoder();
        let html = '', bytes = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                if (bytes > 350000 || Date.now() >= deadline) return '';
                html += decoder.decode(value, { stream: true });
            }
            return html + decoder.decode();
        } finally { await reader.cancel(); }
    } finally { clearTimeout(timer); controller.abort(); }
}

// Follow only explicit article links already present in the selected feed HTML.
// No aggregator crawling, guessed DOI/image paths, model calls, KV or GitHub writes.
export async function enrichBioDailySourceMedia(markdown, candidates, fetcher = fetch) {
    const body = String(markdown).split(/^##\s*\*{0,2}(?:❓\s*)?相关问题/m)[0];
    const cited = new Set(getReferencedSourceUrls(body));
    const result = candidates.map(item => ({ ...item }));
    const diagnostics = { requests: 0, added: 0, failed: 0 };
    const deadline = Date.now() + 6000;
    const attempted = new Set();
    for (const item of result) {
        if (!cited.has(item.url) || safeBioDailyImage(item.mediaUrl)) continue;
        const direct = articleUrl(item.url);
        const linked = [...String(item.contentHtml || '').matchAll(/<a\b[^>]*\shref=["']([^"']+)["']/gi)]
            .map(match => articleUrl(match[1])).find(Boolean);
        const article = direct || linked;
        if (!article || attempted.has(article) || diagnostics.requests >= 3 || Date.now() >= deadline) continue;
        attempted.add(article);
        diagnostics.requests++;
        try {
            const html = await readArticle(fetcher, article, deadline);
            const image = articleImage(html, article);
            if (!image) { diagnostics.failed++; continue; }
            item.mediaUrl = image;
            item.mediaSourceUrl = article;
            diagnostics.added++;
        } catch { diagnostics.failed++; }
    }
    return { candidates: result, diagnostics };
}
