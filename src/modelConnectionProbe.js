import { callChatAPI } from './chatapi.js';

// Bounded connectivity probe: no source fetching, publication, or KV writes.
export async function probeModelConnection(env, route, callModel = callChatAPI) {
    const models = {
        primary: env.DEFAULT_ANTHROPIC_MODEL,
        backup: env.DEFAULT_ANTHROPIC_BACKUP_MODEL,
    };
    if (!Object.hasOwn(models, route) || !models[route]) {
        return { ok: false, error: 'invalid_route' };
    }

    const model = models[route];
    const started = Date.now();
    try {
        const scoped = {
            ...env,
            USE_MODEL_PLATFORM: 'ANTHROPIC',
            DEFAULT_ANTHROPIC_MODEL: model,
            DEFAULT_ANTHROPIC_BACKUP_MODEL: model,
            ANTHROPIC_BACKUP_MODEL: model,
            ANTHROPIC_BACKUP_API_KEY: '',
            OPENAI_API_KEY: '',
            GEMINI_API_KEY: '',
            OPENAI_FALLBACK_ENABLED: 'false',
            GEMINI_FALLBACK_ENABLED: 'false',
            ANTHROPIC_RETRY_MAX: '0',
            ANTHROPIC_MAX_TOKENS: '64',
        };
        const answer = await callModel(scoped, 'Reply with exactly OK.');
        return {
            ok: /^OK[.!！。]?$/i.test(String(answer).trim()),
            route,
            requestedModel: model,
            milliseconds: Date.now() - started,
        };
    } catch {
        return {
            ok: false,
            route,
            requestedModel: model,
            error: 'model_call_failed',
            milliseconds: Date.now() - started,
        };
    }
}

export async function handleModelConnectionProbe(request, env) {
    const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
    };
    if (request.method !== 'POST') {
        return new Response('{}', { status: 405, headers });
    }
    if (!env.TEST_TRIGGER_SECRET || request.headers.get('x-test-trigger-secret') !== env.TEST_TRIGGER_SECRET) {
        return new Response('{"error":"unauthorized"}', { status: 401, headers });
    }

    const route = new URL(request.url).searchParams.get('route') || 'primary';
    const result = await probeModelConnection(env, route);
    const status = result.ok ? 200 : result.error === 'invalid_route' ? 400 : 502;
    return new Response(JSON.stringify(result), { status, headers });
}
