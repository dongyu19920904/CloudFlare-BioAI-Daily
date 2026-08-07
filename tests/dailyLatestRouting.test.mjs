import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('scheduled ordinary daily publishes date and month files without rewriting site home', () => {
    const source = read('src/handlers/scheduled.js');
    const dailyStart = source.indexOf('async function handleScheduledDaily');
    assert.notEqual(dailyStart, -1);
    const dailySource = source.slice(dailyStart);
    assert.match(dailySource, /dailyPagePath/);
    assert.match(dailySource, /monthDirectoryIndexPath/);
    assert.doesNotMatch(dailySource, /content\/cn\/_index\.md/);
    assert.doesNotMatch(dailySource, /updateHomeIndexContent/);
});

test('manual ordinary daily commit leaves the site home untouched', () => {
    const source = read('src/handlers/commitToGitHub.js');
    assert.match(source, /dailyPagePath/);
    assert.match(source, /monthDirectoryIndexPath/);
    assert.doesNotMatch(source, /content\/cn\/_index\.md/);
    assert.doesNotMatch(source, /updateHomeIndexContent/);
});
