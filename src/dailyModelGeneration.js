import {callChatAPI, callChatAPIStream} from './chatapi.js';

export async function generateDailyMarkdownWithFallback(env, userPrompt, systemPrompt, label, clients = {}) {
    const stream = clients.stream || callChatAPIStream;
    const nonStream = clients.nonStream || callChatAPI;
    const dailyEnv = {...env, ANTHROPIC_NATIVE_SYSTEM_PROMPT: true};
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
