import { extractUrls } from './blogQuality.js';

export function canonicalBlogSource(value) {
    try {
        const url = new URL(value);
        url.hash = '';
        for (const name of [...url.searchParams.keys()]) if (/^utm_|^(?:entry|ref)$/i.test(name)) url.searchParams.delete(name);
        return url.href.replace(/\/$/, '');
    } catch { return ''; }
}

export function parseBlogHistory(markdown, date) {
    const match = String(markdown).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    const scalar = match?.[1].match(/^title:\s*(.+)$/m)?.[1]?.trim();
    if (!scalar) return null;
    let title = scalar;
    if (scalar.startsWith('"')) { try { title = JSON.parse(scalar); } catch { return null; } }
    else if (scalar.startsWith("'")) title = scalar.slice(1, -1).replace(/''/g, "'");
    const body = match[2].split(/^##\s+参考资料/m)[0].trim();
    const references = match[2].split(/^##\s+参考资料/m)[1]?.split(/^---/m)[0] || '';
    return { date, title, body: body.slice(0, 6000), sources: extractUrls(references).map(canonicalBlogSource).filter(Boolean) };
}

export async function loadRecentBlogHistory(env, blogType, dateStr, fetcher = fetch) {
    // An unauthenticated synthetic preview cannot publish anyway; production has a GitHub binding.
    if (!env.GITHUB_TOKEN) return [];
    const owner = env.GITHUB_REPO_OWNER;
    const repo = env.BLOG_REPO_NAME || 'astro-paper';
    const branch = env.BLOG_REPO_BRANCH || 'main';
    const root = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/src/data/blog`;
    const headers = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.raw+json', 'User-Agent': 'Personal-Blog-History/1.0' };
    const list = await fetcher(`${root}?ref=${encodeURIComponent(branch)}`, { method: 'GET', headers: { ...headers, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000), redirect: 'manual' });
    if (!list.ok) throw new Error(`Personal blog history unavailable: HTTP ${list.status}`);
    const files = await list.json();
    if (!Array.isArray(files)) throw new Error('Invalid personal blog history listing');
    const start = new Date(`${dateStr}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 7);
    const first = start.toISOString().slice(0, 10);
    const pattern = new RegExp(`^${blogType}-(\\d{4}-\\d{2}-\\d{2})\\.md$`);
    const recent = files.map(file => ({ name: file.name, date: file.name?.match(pattern)?.[1] }))
        .filter(file => file.date && file.date >= first && file.date < dateStr).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    const posts = [];
    for (const file of recent) {
        const response = await fetcher(`${root}/${encodeURIComponent(file.name)}?ref=${encodeURIComponent(branch)}`, { method: 'GET', headers, signal: AbortSignal.timeout(10000), redirect: 'manual' });
        if (!response.ok) throw new Error(`Personal blog history read failed: HTTP ${response.status}`);
        const text = await response.text();
        if (text.length > 100000) throw new Error('Personal blog history file too large');
        const post = parseBlogHistory(text, file.date);
        if (!post) throw new Error('Personal blog history article could not be parsed');
        posts.push(post);
    }
    return posts;
}

function prose(text) {
    return String(text).replace(/!\[[^\]]*\]\([^\n]+?\)/g, '').replace(/\[([^\]]*)\]\([^\n]+?\)/g, '$1')
        .replace(/https?:\/\/\S+/g, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase().slice(0, 6000);
}
function grams(text, size) {
    const clean = prose(text);
    return new Set(Array.from({ length: Math.max(0, clean.length - size + 1) }, (_, i) => clean.slice(i, i + size)));
}
export function blogTextSimilarity(a, b, size = 3) {
    const left = grams(a, size), right = grams(b, size);
    if (!left.size || !right.size) return 0;
    let shared = 0;
    for (const gram of left) if (right.has(gram)) shared++;
    return 2 * shared / (left.size + right.size);
}
export function blogAngle(text) {
    const opening = String(text).slice(0, 420);
    return /改.{0,12}(?:代码|功能|函数|模块)|改动|动手之前/.test(opening)
        && /调用|影响.{0,8}(?:范围|地方|哪里|几处)|波及|牵动|依赖|关联|还会动/.test(opening) ? 'code-change-impact' : '';
}
export function assessBlogNovelty(draft, recentPosts = []) {
    const severe = [];
    const angle = blogAngle(`${draft.title}\n${draft.body}`);
    for (const post of recentPosts) {
        if (prose(draft.title) === prose(post.title) || blogTextSimilarity(draft.title, post.title, 2) >= 0.68) severe.push('repeated_blog_title');
        if (prose(draft.body).length >= 150 && prose(post.body).length >= 150 && blogTextSimilarity(draft.body, post.body) >= 0.58) severe.push('repeated_blog_content');
        if (angle && angle === blogAngle(`${post.title}\n${post.body}`)) severe.push('repeated_blog_angle');
    }
    return [...new Set(severe)];
}

export function buildBlogHistoryContext(posts) {
    return JSON.stringify(posts.map(post => ({ date: post.date, title: post.title, opening: post.body.slice(0, 220) })));
}
