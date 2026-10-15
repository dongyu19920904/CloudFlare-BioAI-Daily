import test from 'node:test';
import assert from 'node:assert/strict';
import { runOpportunityBatch } from '../src/opportunityBatch.js';

test('an opportunity exception does not prevent the project section from running', async () => {
    const calls = [];
    const result = await runOpportunityBatch('2026-10-15', {
        opportunity: async () => { calls.push('opportunity'); throw new Error('source gate blocked'); },
        projectOpportunity: async () => { calls.push('project'); return { success: true }; },
    });
    assert.deepEqual(calls, ['opportunity', 'project']);
    assert.equal(result.success, false);
    assert.equal(result.partialSuccess, true);
    assert.deepEqual(result.failedSections, ['opportunity']);
    assert.equal(result.projectOpportunity.success, true);
});

test('a failed second section does not hide the already completed first section', async () => {
    const first = { success: true, paths: { pagePath: 'first.md' } };
    const result = await runOpportunityBatch('2026-10-15', {
        opportunity: async () => first,
        projectOpportunity: async () => { throw new Error('project failed'); },
    });
    assert.equal(result.opportunity, first);
    assert.equal(result.success, false);
    assert.deepEqual(result.failedSections, ['projectOpportunity']);
});

test('only two complete sections make the batch successful', async () => {
    for (const [a, b] of [[true, true], [true, false], [false, true], [false, false]]) {
        const result = await runOpportunityBatch('2026-10-15', {
            opportunity: async () => ({ success: a }), projectOpportunity: async () => ({ success: b }),
        });
        assert.equal(result.success, a && b);
        assert.equal(result.partialSuccess, a !== b);
    }
});
