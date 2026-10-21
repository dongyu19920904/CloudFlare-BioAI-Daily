import { callChatAPI, resolveAnthropicConfig } from './chatapi.js';

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
    const config = resolveAnthropicConfig(env)[route];
    const apiKey = route === 'backup' ? env.ANTHROPIC_BACKUP_API_KEY : env.ANTHROPIC_API_KEY;
    if (!config.messagesUrl || !apiKey) return { ok: false, route, error: 'route_not_configured' };
    const started = Date.now();
    try {
        const scoped = {
            ...env,
            USE_MODEL_PLATFORM: 'ANTHROPIC',
            ANTHROPIC_API_BASE_URL: config.messagesUrl,
            ANTHROPIC_API_KEY: apiKey,
            DEFAULT_ANTHROPIC_MODEL: model,
            DEFAULT_ANTHROPIC_BACKUP_MODEL: model,
            ANTHROPIC_BACKUP_MODEL: model,
            ANTHROPIC_BACKUP_API_KEY: '',
            OPENAI_API_KEY: '',
            GEMINI_API_KEY: '',
            OPENAI_FALLBACK_ENABLED: 'false',
            GEMINI_FALLBACK_ENABLED: 'false',
            ANTHROPIC_RETRY_MAX: '0',
            ANTHROPIC_MAX_TOKENS: '256',
            ANTHROPIC_REQUEST_TIMEOUT_MS: '20000',
            ANTHROPIC_NATIVE_SYSTEM_PROMPT: true,
        };
        const answer = await callModel(scoped, 'Reply with exactly OK.', 'Return only OK, without commentary.');
        return {
            ok: /^OK[.!！。]?$/i.test(String(answer).trim()),
            route,
            requestedModel: model,
            milliseconds: Date.now() - started,
        };
    } catch (error) {
        return {
            ok: false,
            route,
            requestedModel: model,
            error: 'model_call_failed',
            status: Number.isInteger(error?.status) ? error.status : null,
            timedOut: error?.name === 'AbortError',
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
