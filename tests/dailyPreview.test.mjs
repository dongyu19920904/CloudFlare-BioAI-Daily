import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('daily preview remains behind trigger authentication and returns before publication', () => {
    const index = read('../src/index.js');
    const scheduled = read('../src/handlers/scheduled.js');
    const start = index.indexOf('// Test endpoint for triggering scheduled task');
    const auth = index.indexOf('if (!expectedKey || secretKey !== expectedKey)', start);
    const preview = index.indexOf("const dryRun = url.searchParams.get('dryRun') === '1'", start);
    assert.ok(start >= 0 && auth > start && preview > auth);
    assert.match(index.slice(preview), /mode !== 'daily' \|\| forceAsync/);
    const daily = scheduled.slice(scheduled.indexOf('export async function handleScheduledDaily'));
    assert.match(daily, /options\.dryRun\s*\? await readBioDailyPreviewCache/);
    assert.ok(daily.indexOf('if (options.dryRun)') < daily.indexOf('// 6. Commit to GitHub'));
    assert.match(daily, /dryRun: true.*markdown: dailySummaryMarkdownContent/);
});

test('preview workflow restricts version hosts and publishes no draft without explicit production mode', () => {
    const workflow = read('../.github/workflows/manual-trigger-worker.yml');
    assert.match(workflow, /Version URLs are allowed only for daily previews/);
    assert.match(workflow, /Worker URL is not an approved BioAI host/);
    assert.match(workflow, /Daily preview must be synchronous/);
    assert.match(workflow, /r\.result\?\.dryRun!==true/);
    assert.match(workflow, /actions\/upload-artifact@v4/);
});
