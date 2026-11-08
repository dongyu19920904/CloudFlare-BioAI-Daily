import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { PapersCoolDataSource } from '../src/dataSources/longevity-rss.js';
import { assessBioPaper } from '../src/bioPaperSelection.js';
import { getISODate, setFetchDate } from '../src/helpers.js';

// Explicitly read-only: one public RSS GET, no model, KV, GitHub or secrets.
const args = process.argv.slice(2);
const value = key => args.includes(key) ? args[args.indexOf(key) + 1] : '';
const input = value('--input');
if (!args.includes('--live') && !input) throw new Error('Use --live for one public RSS read, or --input for offline replay.');
if (args.includes('--live') && input) throw new Error('Choose live OR offline input.');
const date = value('--date') || getISODate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error('Invalid --date');
const output = value('--output');
if (output && !resolve(output).toLowerCase().startsWith((resolve('D:/CodexCache/artifacts') + sep).toLowerCase())) {
    throw new Error('--output must be inside D:/CodexCache/artifacts');
}
setFetchDate(date);
let sourceXml = '';
let requests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    if (url !== 'https://papers.cool/arxiv/cs.AI/feed' || requests++ > 0) throw new Error('Only one cs.AI read is allowed');
    if (input) {
        if ((await stat(input)).size > 2 * 1024 * 1024) throw new Error('Input exceeds 2 MiB');
        sourceXml = await readFile(input, 'utf8');
    } else {
        const response = await originalFetch(url, options);
        if (!response.ok) return response;
        // Stream recording shares the production reader's timeout and 2 MiB bound.
        const decoder = new TextDecoder();
        return new Response(response.body.pipeThrough(new TransformStream({
            transform(chunk, controller) { sourceXml += decoder.decode(chunk, { stream: true }); controller.enqueue(chunk); },
            flush() { sourceXml += decoder.decode(); },
        })), { status: response.status, headers: response.headers });
    }
    return new Response(sourceXml, { headers: { 'content-type': 'application/atom+xml' } });
};
const raw = await PapersCoolDataSource.fetch({
    PAPERS_COOL_RSS_URLS: 'Papers.cool cs.AI::https://papers.cool/arxiv/cs.AI/feed',
    PAPERS_COOL_MAX_FEEDS_PER_RUN: '1',
    PAPERS_COOL_MAX_ITEMS_PER_FEED: '10',
    PAPERS_COOL_FILTER_DAYS: '7',
    DATA_SOURCE_FETCH_TIMEOUT_MS: '20000',
});
const report = {
    checkedAt: new Date().toISOString(), referenceDate: date, readOnly: true, offlineReplay: Boolean(input),
    publicRequests: input ? 0 : requests,
    modelCalls: 0, productionWrites: 0, diagnostics: raw.diagnostics,
    selected: PapersCoolDataSource.transform(raw, 'paper').map(item => ({
        title: item.title, url: item.url, published: item.published_date,
        updated: item.details.updatedAt, dateBasis: item.details.dateBasis,
        relevance: assessBioPaper(item), abstract: item.description,
    })),
};
if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n');
    if (!input && raw.diagnostics.feeds.every(feed => feed.status === 'ok')) await writeFile(resolve(output) + '.atom', sourceXml);
}
console.log(JSON.stringify({ ...report, selected: report.selected.map(({ abstract, ...item }) => item) }, null, 2));
if (raw.diagnostics.feeds.some(feed => feed.status !== 'ok')) process.exitCode = 1;
