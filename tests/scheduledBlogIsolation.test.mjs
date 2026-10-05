import test from 'node:test';
import assert from 'node:assert/strict';

import { getBlogJobConfigs, summarizeBlogResults } from '../src/handlers/scheduledBlog.js';

test('personal blog jobs are only the two blog reuse targets', () => {
    assert.deepEqual(
        getBlogJobConfigs('2026-08-06').map(config => config.type),
        ['ai-daily', 'bioai-daily']
    );
});

test('one personal blog failure is visible even when the other publishes', () => {
    const summary = summarizeBlogResults([
        { type: 'ai-daily', status: 'failed' },
        { type: 'bioai-daily', status: 'success' },
    ]);

    assert.equal(summary.success, false);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.successCount, 1);
});

test('all skipped is incomplete, both existing is complete', () => {
    assert.equal(summarizeBlogResults([{status:'skipped'}, {status:'skipped'}]).success, false);
    assert.equal(summarizeBlogResults([{status:'existing'}, {status:'existing'}]).success, true);
    assert.equal(summarizeBlogResults([]).success, false);
});

test('a blog-only failure does not masquerade as success when nothing published', () => {
    const summary = summarizeBlogResults([
        { type: 'ai-daily', status: 'failed' },
        { type: 'bioai-daily', status: 'skipped' },
    ]);

    assert.equal(summary.success, false);
});
