import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function resolveGuardDate(now = new Date()) {
    const shanghai = new Date(now.getTime() + 8 * 3600000);
    if (shanghai.getUTCHours() < 12) shanghai.setUTCDate(shanghai.getUTCDate() - 1);
    return shanghai.toISOString().slice(0, 10);
}

export function validateTargetDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Invalid target date');
    return value;
}

export function validateWorkerUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^(?:[a-z0-9-]+-)?cloudflare-bioai-daily\.sabrinamisan090\.workers\.dev$/.test(url.hostname)) throw new Error('Unapproved blog Worker host');
    return url.origin;
}

async function githubFileExists(path) {
    const response = await fetch(`https://api.github.com/repos/dongyu19920904/astro-paper/contents/${path}?ref=main`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'personal-blog-guard', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
        signal: AbortSignal.timeout(30000),
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`Blog existence check failed: HTTP ${response.status}`);
    return true;
}

async function main() {
    const date = validateTargetDate(process.env.TARGET_DATE || resolveGuardDate());
    const mode = process.env.BLOG_MODE || 'publish';
    if (!['preview', 'publish'].includes(mode)) throw new Error('Invalid blog mode');
    const paths = ['ai-daily', 'bioai-daily'].map(type => `src/data/blog/${type}-${date}.md`);
    const missing = [];
    for (const path of paths) if (!await githubFileExists(path)) missing.push(path);
    let report = { date, mode, missing, success: missing.length === 0, results: [] };
    if (missing.length) {
        const base = validateWorkerUrl(process.env.BLOG_WORKER_URL || 'https://cloudflare-bioai-daily.sabrinamisan090.workers.dev');
        if (!process.env.TEST_TRIGGER_SECRET) throw new Error('Missing TEST_TRIGGER_SECRET');
        const url = new URL('/testTriggerBlog', base);
        url.searchParams.set('key', process.env.TEST_TRIGGER_SECRET);
        url.searchParams.set('date', date);
        if (mode === 'preview') url.searchParams.set('dryRun', '1');
        let response;
        try { response = await fetch(url, { signal: AbortSignal.timeout(600000) }); }
        catch { throw new Error('Blog-only trigger failed or timed out; do not blindly retry an in-flight generation'); }
        const payload = await response.json();
        report = { ...report, success: payload.success === true, results: payload.result?.results || [], httpStatus: response.status };
        if (mode === 'publish') {
            report.missing = [];
            for (const path of paths) if (!await githubFileExists(path)) report.missing.push(path);
            report.success = report.missing.length === 0;
        }
    }
    await writeFile('personal-blog-report.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ ...report, results: report.results.map(({ content, ...item }) => item) }, null, 2));
    if (!report.success) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
