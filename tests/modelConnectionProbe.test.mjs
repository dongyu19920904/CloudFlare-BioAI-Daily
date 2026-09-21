import assert from 'node:assert/strict';
import test from 'node:test';

import {
    handleModelConnectionProbe,
    probeModelConnection,
} from '../src/modelConnectionProbe.js';

const env = {
    DEFAULT_ANTHROPIC_MODEL: 'claude-sonnet-5',
    DEFAULT_ANTHROPIC_BACKUP_MODEL: 'claude-opus-4-8',
    ANTHROPIC_API_BASE_URL: 'https://example.test',
    ANTHROPIC_API_KEY: 'test-key',
    TEST_TRIGGER_SECRET: 'test-only-trigger',
};

test('BioAI probes use a fixed prompt, small budget, and no fallback providers', async () => {
    for (const route of ['primary', 'backup']) {
        const result = await probeModelConnection(env, route, async (scoped, prompt) => {
            assert.equal(prompt, 'Reply with exactly OK.');
            assert.equal(scoped.ANTHROPIC_MAX_TOKENS, '64');
            assert.equal(scoped.ANTHROPIC_RETRY_MAX, '0');
            assert.equal(
                scoped.DEFAULT_ANTHROPIC_MODEL,
                route === 'backup' ? 'claude-opus-4-8' : 'claude-sonnet-5'
            );
            assert.equal(scoped.DEFAULT_ANTHROPIC_BACKUP_MODEL, scoped.DEFAULT_ANTHROPIC_MODEL);
            assert.equal(scoped.OPENAI_FALLBACK_ENABLED, 'false');
            assert.equal(scoped.ANTHROPIC_BACKUP_API_KEY, '');
            assert.equal(scoped.OPENAI_API_KEY, '');
            assert.equal(scoped.GEMINI_API_KEY, '');
            return 'OK.';
        });
        assert.equal(result.ok, true);
        assert.equal(JSON.stringify(result).includes(env.ANTHROPIC_API_KEY), false);
    }
});

test('BioAI probe rejects invalid routes and does not expose provider errors', async () => {
    const invalid = await probeModelConnection(env, 'arbitrary', () => assert.fail('not allowed'));
    assert.equal(invalid.error, 'invalid_route');

    const failed = await probeModelConnection(env, 'primary', () => {
        throw new Error(env.ANTHROPIC_API_KEY);
    });
    assert.equal(failed.error, 'model_call_failed');
    assert.equal(JSON.stringify(failed).includes(env.ANTHROPIC_API_KEY), false);
});

test('BioAI probe requires POST and the configured trigger secret', async () => {
    const url = 'https://worker.test/testModelConnection?route=unknown';
    assert.equal((await handleModelConnectionProbe(new Request(url), env)).status, 405);

    const unauthorized = new Request(url, {
        method: 'POST',
        headers: { 'x-test-trigger-secret': 'wrong' },
    });
    assert.equal((await handleModelConnectionProbe(unauthorized, env)).status, 401);

    const authorized = new Request(url, {
        method: 'POST',
        headers: { 'x-test-trigger-secret': env.TEST_TRIGGER_SECRET },
    });
    const response = await handleModelConnectionProbe(authorized, env);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
