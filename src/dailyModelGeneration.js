import {callChatAPI, callChatAPIStream, resolveAnthropicConfig} from './chatapi.js';

export async function generateDailyMarkdownWithFallback(env, userPrompt, systemPrompt, label, clients = {}) {
    const stream = clients.stream || callChatAPIStream;
    const nonStream = clients.nonStream || callChatAPI;
    const dailyEnv = {...env, ANTHROPIC_NATIVE_SYSTEM_PROMPT: true};
    if (String(env.USE_MODEL_PLATFORM).toUpperCase() === 'ANTHROPIC' && env.DAILY_MODEL_ROUTE === 'backup') {
        const route = resolveAnthropicConfig(env).backup;
        if (!route.messagesUrl || !route.modelName || !env.ANTHROPIC_BACKUP_API_KEY) {
            throw new Error('Daily backup model route is not configured');
        }
        Object.assign(dailyEnv, {
            ANTHROPIC_API_BASE_URL: route.messagesUrl,
            ANTHROPIC_API_KEY: env.ANTHROPIC_BACKUP_API_KEY,
            DEFAULT_ANTHROPIC_MODEL: route.modelName,
            ANTHROPIC_BACKUP_API_KEY: '',
        });
        console.log(`[Daily][${label}] Using configured backup model: ${route.modelName}`);
    }
    let output = '';
    try {
        for await (const chunk of stream(dailyEnv, userPrompt, systemPrompt)) output += chunk;
        if (!output.trim()) throw new Error('Daily stream yielded no content');
        return output;
    } catch (error) {
        const message = String(error?.message || error);
        const transient = error?.name === 'AbortError' || /(524|timeout|timed out|yielded no content|truncated|max_tokens|network connection lost|networkerror|fetch failed|terminated|econnreset|socket hang up)/i.test(message);
        if (!transient) throw error;
        console.warn(`[Daily][${label}] Stream interrupted; retrying once without streaming.`);
        // Never append a new completion to the partial response from a broken stream.
        return nonStream(dailyEnv, userPrompt, systemPrompt);
    }
}
