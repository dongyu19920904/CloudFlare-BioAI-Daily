// src/chatapi.js

const GEMINI_API_VERSIONS = ["v1beta", "v1", ""];

function normalizeBaseUrl(url) {
    return String(url || "").replace(/\/+$/, "");
}

function getGeminiApiKey(env) {
    return env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY;
}

function getGeminiModelName(env) {
    return env.DEFAULT_GEMINI_MODEL || env.GEMINI_MODEL;
}

function getGeminiApiVersionCandidates(env, baseUrl) {
    const configured = String(env.GEMINI_API_VERSION ?? "auto").trim().toLowerCase();
    const base = normalizeBaseUrl(baseUrl);
    const baseHasVersion = /\/v1beta$|\/v1$/i.test(base);
    if (baseHasVersion) {
        return [""];
    }

    if (configured === "" || configured === "auto" || configured === "default") {
        return GEMINI_API_VERSIONS;
    }
    if (configured === "v1beta" || configured === "v1") {
        return [configured];
    }
    if (
        configured === "noversion" ||
        configured === "no-version" ||
        configured === "no_version" ||
        configured === "none" ||
        configured === "off" ||
        configured === "0"
    ) {
        return [""];
    }

    return GEMINI_API_VERSIONS;
}

function isGeminiDebug(env) {
    const value = String(env.GEMINI_DEBUG ?? "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "on";
}

function redactGeminiUrl(url) {
    return String(url || "").replace(/([?&]key=)[^&]+/gi, "$1***");
}

function logGeminiDebug(env, message, meta) {
    if (!isGeminiDebug(env)) return;
    if (meta) {
        console.log(message, meta);
        return;
    }
    console.log(message);
}

function isInvalidArgumentError(status, message) {
    if (status !== 400) return false;
    const text = String(message || "").toLowerCase();
    return text.includes("invalid argument") || text.includes("invalid_argument");
}

function isRateLimitError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return (
        message.includes("429") ||
        message.includes("too many requests") ||
        message.includes("resource_exhausted") ||
        message.includes("并发请求数量过多")
    );
}

function canUseAnthropicFallback(env) {
    return Boolean(env.ANTHROPIC_API_URL && env.ANTHROPIC_API_KEY);
}

function formatGeminiVariant(variant) {
    return `system=${variant.useSystemInstruction ? "on" : "off"}, merge=${variant.mergeSystem ? "on" : "off"}, role=${variant.useRole ? "on" : "off"}, gen=${variant.includeGenerationConfig ? "on" : "off"}`;
}

function getGeminiPayloadVariants(hasSystem, allowGenerationConfig) {
    const variants = [];
    const genOptions = allowGenerationConfig ? [true, false] : [false];

    if (hasSystem) {
        for (const includeGenerationConfig of genOptions) {
            variants.push({ useSystemInstruction: true, mergeSystem: false, useRole: true, includeGenerationConfig });
            variants.push({ useSystemInstruction: true, mergeSystem: false, useRole: false, includeGenerationConfig });
            variants.push({ useSystemInstruction: false, mergeSystem: true, useRole: true, includeGenerationConfig });
            variants.push({ useSystemInstruction: false, mergeSystem: true, useRole: false, includeGenerationConfig });
        }
    } else {
        for (const includeGenerationConfig of genOptions) {
            variants.push({ useSystemInstruction: false, mergeSystem: false, useRole: true, includeGenerationConfig });
            variants.push({ useSystemInstruction: false, mergeSystem: false, useRole: false, includeGenerationConfig });
        }
    }

    return variants;
}

function buildGeminiPayload(promptText, systemPromptText, variant) {
    const hasSystem = systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '';
    const useSystemInstruction = variant.useSystemInstruction && hasSystem;
    const shouldMergeSystem = variant.mergeSystem && hasSystem && !useSystemInstruction;
    const effectivePromptText = shouldMergeSystem ? `${systemPromptText}\n\n${promptText}` : promptText;
    const parts = [{ text: effectivePromptText }];
    const content = variant.useRole ? { role: "user", parts } : { parts };
    const payload = { contents: [content] };

    if (useSystemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemPromptText }] };
    }
    if (variant.includeGenerationConfig) {
        payload.generationConfig = {
            temperature: 1,
            topP: 0.95
        };
    }

    return { payload };
}

function getGeminiStreamMode(env) {
    const mode = String(env.GEMINI_STREAM_MODE ?? "auto").trim().toLowerCase();
    if (
        mode === "off" ||
        mode === "false" ||
        mode === "0" ||
        mode === "no" ||
        mode === "none" ||
        mode === "disable" ||
        mode === "disabled" ||
        mode === "nostream" ||
        mode === "nonstream" ||
        mode === "non-stream" ||
        mode === "non_stream"
    ) {
        return "off";
    }
    if (mode === "force" || mode === "on" || mode === "true" || mode === "1") {
        return "force";
    }
    return "auto";
}

function buildGeminiHeaders(apiKey, useHeaderAuth) {
    const headers = { 'Content-Type': 'application/json' };
    if (useHeaderAuth && apiKey) {
        headers['x-goog-api-key'] = apiKey;
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
}

function getGeminiRetryConfig(env) {
    const maxRetries = Number.parseInt(env.GEMINI_RETRY_MAX ?? "2", 10);
    const baseDelayMs = Number.parseInt(env.GEMINI_RETRY_BASE_MS ?? "1000", 10);
    return {
        maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 2,
        baseDelayMs: Number.isFinite(baseDelayMs) && baseDelayMs >= 0 ? baseDelayMs : 1000,
        retryStatuses: new Set([429])
    };
}

function parseRetryAfterMillis(retryAfter) {
    if (!retryAfter) return null;
    const trimmed = String(retryAfter).trim();
    if (!trimmed) return null;
    const seconds = Number.parseInt(trimmed, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
    }
    const parsedDate = Date.parse(trimmed);
    if (Number.isFinite(parsedDate)) {
        const diff = parsedDate - Date.now();
        return diff > 0 ? diff : 0;
    }
    return null;
}

async function sleep(ms) {
    if (!ms || ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, timeout, retryConfig, debugLog) {
    const { maxRetries, baseDelayMs, retryStatuses } = retryConfig;
    let attempt = 0;
    while (true) {
        const response = await fetchWithTimeout(url, options, timeout);
        if (!retryStatuses.has(response.status) || attempt >= maxRetries) {
            return response;
        }
        const retryAfter = parseRetryAfterMillis(response.headers?.get?.("retry-after"));
        const delayMs = retryAfter ?? (baseDelayMs * Math.pow(2, attempt));
        if (debugLog) {
            debugLog(`Gemini retrying after ${response.status}`, { delayMs, attempt });
        }
        try {
            response.body?.cancel?.();
        } catch (e) {
            // Best-effort cleanup before retry.
        }
        await sleep(delayMs);
        attempt += 1;
    }
}

function buildGeminiUrl(baseUrl, apiVersion, modelName, method, apiKey, useQueryKey, extraQuery = "") {
    const base = normalizeBaseUrl(baseUrl);
    const versionSegment = apiVersion ? `/${apiVersion}` : "";
    const path = `${base}${versionSegment}/models/${modelName}:${method}`;
    const queryParts = [];
    if (useQueryKey && apiKey) queryParts.push(`key=${encodeURIComponent(apiKey)}`);
    if (extraQuery) queryParts.push(extraQuery.replace(/^[?&]/, ""));
    return queryParts.length ? `${path}?${queryParts.join("&")}` : path;
}

function shouldFallbackToMergedSystem(systemPromptText, errorBodyText) {
    if (!systemPromptText || typeof systemPromptText !== 'string' || systemPromptText.trim() === '') return false;
    const t = String(errorBodyText || "").toLowerCase();
    return t.includes("systeminstruction") || t.includes("system_instruction") || t.includes("system instruction");
}

function extractGeminiTextFromResponse(data) {
    if (data?.promptFeedback?.blockReason) {
        const blockReason = data.promptFeedback.blockReason;
        const safetyRatings = data.promptFeedback.safetyRatings ? JSON.stringify(data.promptFeedback.safetyRatings) : 'N/A';
        throw new Error(`Gemini Chat prompt blocked: ${blockReason}. Safety ratings: ${safetyRatings}`);
    }

    if (data?.candidates?.length > 0) {
        const candidate = data.candidates[0];

        if (candidate.finishReason && candidate.finishReason !== "STOP") {
            const reason = candidate.finishReason;
            const safetyRatings = candidate.safetyRatings ? JSON.stringify(candidate.safetyRatings) : 'N/A';
            if (reason === "SAFETY") {
                throw new Error(`Gemini Chat content generation blocked due to safety (${reason}). Safety ratings: ${safetyRatings}`);
            }
            throw new Error(`Gemini Chat content generation finished due to: ${reason}. Safety ratings: ${safetyRatings}`);
        }

        const text = candidate?.content?.parts?.[0]?.text;
        if (text && typeof text === 'string') {
            return text;
        }
        throw new Error("Gemini Chat API returned a candidate with 'STOP' finishReason but no text content.");
    }

    throw new Error("Gemini Chat API returned an empty or malformed response with no candidates.");
}

/**
 * Calls the Gemini Chat API (non-streaming).
 *
 * @param {object} env - Environment object containing GEMINI_API_URL.
 * @param {string} promptText - The user's prompt.
 * @param {string | null} [systemPromptText=null] - Optional system prompt text.
 * @returns {Promise<string>} The generated text content.
 * @throws {Error} If GEMINI_API_URL is not set, or if API call fails or returns blocked/empty content.
 */
async function callGeminiChatAPI(env, promptText, systemPromptText = null) {
    if (!env.GEMINI_API_URL) {
        throw new Error("GEMINI_API_URL environment variable is not set.");
    }
    const apiKey = getGeminiApiKey(env);
    if (!apiKey) {
        throw new Error("Gemini API key is not set (set GEMINI_API_KEY, or reuse ANTHROPIC_API_KEY/OPENAI_API_KEY).");
    }
    const modelName = getGeminiModelName(env);
    if (!modelName) {
        throw new Error("DEFAULT_GEMINI_MODEL environment variable is not set.");
    }

    const baseUrl = normalizeBaseUrl(env.GEMINI_API_URL);
    const authModes = [
        { useQueryKey: true, useHeaderAuth: false },
        { useQueryKey: false, useHeaderAuth: true },
    ];

    const hasSystem = systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '';
    const payloadVariants = getGeminiPayloadVariants(hasSystem, false);
    let lastCompatibilityError = null;

    try {
        versionLoop:
        for (const apiVersion of getGeminiApiVersionCandidates(env, baseUrl)) {
            authLoop:
            for (const auth of authModes) {
                for (const variant of payloadVariants) {
                    const { payload } = buildGeminiPayload(promptText, systemPromptText, variant);
                    const url = buildGeminiUrl(baseUrl, apiVersion, modelName, "generateContent", apiKey, auth.useQueryKey);
                    logGeminiDebug(env, "Gemini non-stream request", { url: redactGeminiUrl(url), variant: formatGeminiVariant(variant) });

                    const response = await fetchWithRetry(
                        url,
                        {
                            method: 'POST',
                            headers: buildGeminiHeaders(apiKey, auth.useHeaderAuth),
                            body: JSON.stringify(payload)
                        },
                        180000,
                        getGeminiRetryConfig(env),
                        (message, meta) => logGeminiDebug(env, message, meta)
                    );

                    const contentType = response.headers.get('content-type') || '';
                    if (!response.ok) {
                        const errorBodyText = await response.text();
                        let errorData;
                        try {
                            errorData = JSON.parse(errorBodyText);
                        } catch (e) {
                            errorData = errorBodyText;
                        }
                        const message = typeof errorData === 'object' && errorData.error?.message
                            ? errorData.error.message
                            : (typeof errorData === 'string' ? errorData : 'Unknown Gemini Chat API error');

                        logGeminiDebug(env, "Gemini non-stream error response", {
                            url: redactGeminiUrl(url),
                            status: response.status,
                            contentType,
                            variant: formatGeminiVariant(variant),
                            bodyPreview: String(errorBodyText || "").slice(0, 200)
                        });

                        lastCompatibilityError = new Error(`Gemini Chat API error (${response.status}): ${message}`);

                        if (response.status === 404 || response.status === 405) {
                            continue versionLoop; // try next API version
                        }
                        if ((response.status === 401 || response.status === 403) && auth.useQueryKey) {
                            continue authLoop; // try header auth
                        }
                        if (isInvalidArgumentError(response.status, message)) {
                            continue; // try next payload variant
                        }
                        continue; // try next payload variant
                    }

                    if (!contentType.includes('application/json')) {
                        const bodyText = await response.text();
                        logGeminiDebug(env, "Gemini non-stream non-JSON response", {
                            url: redactGeminiUrl(url),
                            status: response.status,
                            contentType,
                            variant: formatGeminiVariant(variant),
                            bodyPreview: String(bodyText || "").slice(0, 200)
                        });
                        lastCompatibilityError = new Error(`Gemini Chat API error (${response.status}): Non-JSON response (${contentType || 'unknown'})`);
                        continue; // try next payload variant
                    }

                    const data = await response.json();
                    if (data?.error?.message) {
                        const message = data.error.message;
                        lastCompatibilityError = new Error(`Gemini Chat API error (${response.status}): ${message}`);
                        if (isInvalidArgumentError(response.status, message)) {
                            continue; // try next payload variant
                        }
                        continue;
                    }
                    return extractGeminiTextFromResponse(data);
                }
            }
        }

        if (lastCompatibilityError) {
            throw lastCompatibilityError;
        }
        throw new Error("Gemini Chat API error: failed to reach a compatible endpoint (check GEMINI_API_URL / proxy compatibility).");
    } catch (error) {
        // Log the full error object if it's not one we constructed, or just re-throw
        if (!(error instanceof Error && error.message.startsWith("Gemini Chat"))) {
            console.error("Error calling Gemini Chat API (Non-streaming):", error);
        }
        throw error;
    }
}


/**
 * Calls the Gemini Chat API with streaming.
 *
 * @param {object} env - Environment object containing GEMINI_API_URL.
 * @param {string} promptText - The user's prompt.
 * @param {string | null} [systemPromptText=null] - Optional system prompt text.
 * @returns {AsyncGenerator<string, void, undefined>} An async generator yielding text chunks.
 * @throws {Error} If GEMINI_API_URL is not set, or if API call fails or returns blocked/empty content.
 */
async function* callGeminiChatAPIStream(env, promptText, systemPromptText = null) {
    if (!env.GEMINI_API_URL) {
        throw new Error("GEMINI_API_URL environment variable is not set.");
    }
    const apiKey = getGeminiApiKey(env);
    if (!apiKey) {
        throw new Error("Gemini API key is not set (set GEMINI_API_KEY, or reuse ANTHROPIC_API_KEY/OPENAI_API_KEY).");
    }
    const modelName = getGeminiModelName(env);
    if (!modelName) {
        throw new Error("DEFAULT_GEMINI_MODEL environment variable is not set.");
    }

    const baseUrl = normalizeBaseUrl(env.GEMINI_API_URL);
    const authModes = [
        { useQueryKey: true, useHeaderAuth: false },
        { useQueryKey: false, useHeaderAuth: true },
    ];
    const streamQueryVariants = ["alt=sse", ""];
    const streamMode = getGeminiStreamMode(env);

    const hasSystem = systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '';
    const payloadVariants = getGeminiPayloadVariants(hasSystem, true);

    let response = null;
    let lastCompatibilityError = null;
    let hasYieldedContent = false;
    try {
        requestLoop:
        for (const apiVersion of getGeminiApiVersionCandidates(env, baseUrl)) {
            authLoop:
            for (const auth of authModes) {
                for (const streamQuery of streamQueryVariants) {
                    for (const variant of payloadVariants) {
                        const { payload } = buildGeminiPayload(promptText, systemPromptText, variant);
                        const url = buildGeminiUrl(baseUrl, apiVersion, modelName, "streamGenerateContent", apiKey, auth.useQueryKey, streamQuery);
                        logGeminiDebug(env, "Gemini stream request", { url: redactGeminiUrl(url), variant: formatGeminiVariant(variant) });

                        response = await fetchWithRetry(
                            url,
                            {
                                method: 'POST',
                                headers: buildGeminiHeaders(apiKey, auth.useHeaderAuth),
                                body: JSON.stringify(payload)
                            },
                            180000,
                            getGeminiRetryConfig(env),
                            (message, meta) => logGeminiDebug(env, message, meta)
                        );

                        const contentType = response.headers.get('content-type') || '';
                        if (!response.ok) {
                            const errorBodyText = await response.text();
                            let errorData;
                            try {
                                errorData = JSON.parse(errorBodyText);
                            } catch (e) {
                                errorData = errorBodyText;
                            }
                            const message = typeof errorData === 'object' && errorData.error?.message
                                ? errorData.error.message
                                : (typeof errorData === 'string' ? errorData : 'Unknown Gemini Chat API error');

                            logGeminiDebug(env, "Gemini stream error response", {
                                url: redactGeminiUrl(url),
                                status: response.status,
                                contentType,
                                variant: formatGeminiVariant(variant),
                                bodyPreview: String(errorBodyText || "").slice(0, 200)
                            });

                            lastCompatibilityError = new Error(`Gemini Chat API error (${response.status}): ${message}`);

                            if (response.status === 404 || response.status === 405) {
                                continue requestLoop; // try next API version
                            }
                            if ((response.status === 401 || response.status === 403) && auth.useQueryKey) {
                                continue authLoop; // try header auth
                            }
                            if (isInvalidArgumentError(response.status, message)) {
                                continue; // try next payload variant
                            }
                            continue; // try next payload variant
                        }

                        if (contentType && !contentType.includes('application/json') && !contentType.includes('text/event-stream')) {
                            const bodyText = await response.text();
                            logGeminiDebug(env, "Gemini stream non-JSON response", {
                                url: redactGeminiUrl(url),
                                status: response.status,
                                contentType,
                                variant: formatGeminiVariant(variant),
                                bodyPreview: String(bodyText || "").slice(0, 200)
                            });
                            lastCompatibilityError = new Error(`Gemini Chat API error (${response.status}): Non-JSON response (${contentType || 'unknown'})`);
                            response = null;
                            continue; // try next payload variant
                        }

                        break requestLoop; // got an OK response
                    }
                }
            }
        }

        // If streaming endpoint isn't supported by the proxy, gracefully fall back to non-streaming (unless forced).
        if (!response || !response.ok) {
            if (streamMode === "force" && lastCompatibilityError) {
                throw lastCompatibilityError;
            }
            const nonStreamText = await callGeminiChatAPI(env, promptText, systemPromptText);
            yield nonStreamText;
            return;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await response.json();
            yield extractGeminiTextFromResponse(data);
            return;
        }

        if (!response.body) {
            throw new Error("Response body is null, cannot stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let overallFinishReason = null; // To track the final finish reason if available
        let finalSafetyRatings = null;

        const processJsonChunk = (jsonString) => {
            if (jsonString.trim() === "") return null;
            try {
                return JSON.parse(jsonString);
            } catch (e) {
                console.warn("Failed to parse JSON chunk from stream:", jsonString, e.message);
                return null; // Or throw, depending on how strictly you want to handle malformed JSON
            }
        };

        const handleChunkLogic = (chunk) => {
            if (!chunk) return false; // Not a valid chunk to process

            // 1. Check for prompt-level blocking (might appear in first chunk)
            if (chunk.promptFeedback && chunk.promptFeedback.blockReason) {
                const blockReason = chunk.promptFeedback.blockReason;
                const safetyRatings = chunk.promptFeedback.safetyRatings ? JSON.stringify(chunk.promptFeedback.safetyRatings) : 'N/A';
                console.error(`Gemini Chat prompt blocked during stream: ${blockReason}. Safety ratings: ${safetyRatings}`, JSON.stringify(chunk, null, 2));
                throw new Error(`Gemini Chat prompt blocked: ${blockReason}. Safety ratings: ${safetyRatings}`);
            }

            // 2. Check candidates
            if (chunk.candidates && chunk.candidates.length > 0) {
                const candidate = chunk.candidates[0];
                if (candidate.finishReason) {
                    overallFinishReason = candidate.finishReason; // Store the latest finish reason
                    finalSafetyRatings = candidate.safetyRatings;

                    if (candidate.finishReason !== "STOP") {
                        const reason = candidate.finishReason;
                        const sr = candidate.safetyRatings ? JSON.stringify(candidate.safetyRatings) : 'N/A';
                        console.error(`Gemini Chat stream candidate finished with reason: ${reason}. Safety ratings: ${sr}`, JSON.stringify(chunk, null, 2));
                        if (reason === "SAFETY") {
                            throw new Error(`Gemini Chat content generation blocked due to safety (${reason}). Safety ratings: ${sr}`);
                        }
                        throw new Error(`Gemini Chat stream finished due to: ${reason}. Safety ratings: ${sr}`);
                    }
                }

                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                    const textPart = candidate.content.parts[0].text;
                    if (textPart && typeof textPart === 'string') {
                        hasYieldedContent = true;
                        return textPart; // This is the text to yield
                    }
                }
            } else if (chunk.error) { // Check for explicit error object in stream
                console.error("Gemini Chat API Stream Error Chunk:", JSON.stringify(chunk.error, null, 2));
                throw new Error(`Gemini Chat API stream error: ${chunk.error.message || 'Unknown error in stream'}`);
            }
            return null; // No text to yield from this chunk
        };


        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            
            let eventBoundary;
            while ((eventBoundary = buffer.indexOf('\n\n')) !== -1 || (eventBoundary = buffer.indexOf('\n')) !== -1) {
                const separatorLength = (buffer.indexOf('\n\n') === eventBoundary) ? 2 : 1;
                let message = buffer.substring(0, eventBoundary);
                buffer = buffer.substring(eventBoundary + separatorLength);

                if (message.startsWith("data: ")) {
                    message = message.substring(5).trim();
                } else {
                    message = message.trim();
                }

                if (message === "" || message === "[DONE]") {
                    continue;
                }
                
                const parsedChunk = processJsonChunk(message);
                if (parsedChunk) {
                    const textToYield = handleChunkLogic(parsedChunk);
                    if (textToYield !== null) {
                        yield textToYield;
                    }
                }
            }
        }

        // Process any remaining data in the buffer (if not ending with newline(s))
        if (buffer.trim()) {
            let finalMessage = buffer.trim();
             if (finalMessage.startsWith("data: ")) {
                finalMessage = finalMessage.substring(5).trim();
            }
            if (finalMessage !== "" && finalMessage !== "[DONE]") {
                const parsedChunk = processJsonChunk(finalMessage);
                 if (parsedChunk) {
                    const textToYield = handleChunkLogic(parsedChunk);
                    if (textToYield !== null) {
                        yield textToYield;
                    }
                }
            }
        }

        // After the stream has finished, check if any content was yielded and the overall outcome
        if (!hasYieldedContent) {
            if (overallFinishReason && overallFinishReason !== "STOP") {
                const sr = finalSafetyRatings ? JSON.stringify(finalSafetyRatings) : 'N/A';
                console.warn(`Gemini Chat stream ended with reason '${overallFinishReason}' and no content was yielded. Safety: ${sr}`);
                throw new Error(`Gemini Chat stream completed due to ${overallFinishReason} without yielding content. Safety ratings: ${sr}`);
            } else if (overallFinishReason === "STOP") {
                console.warn("Gemini Chat stream finished with 'STOP' but no content was yielded.", JSON.stringify({overallFinishReason, finalSafetyRatings}, null, 2));
                throw new Error("Gemini Chat stream completed with 'STOP' but yielded no content.");
            } else if (!overallFinishReason) {
                console.warn("Gemini Chat stream ended without yielding any content or a clear finish reason.");
                throw new Error("Gemini Chat stream completed without yielding any content.");
            }
        }

    } catch (error) {
        // Auto fallback: if stream isn't compatible, try non-streaming once (only if we haven't yielded partial content).
        if (streamMode === "auto" && !hasYieldedContent) {
            try {
                const nonStreamText = await callGeminiChatAPI(env, promptText, systemPromptText);
                yield nonStreamText;
                return;
            } catch (fallbackError) {
                console.error("Gemini stream failed; non-stream fallback also failed:", fallbackError);
            }
        }

        if (!(error instanceof Error && error.message.startsWith("Gemini Chat"))) {
            console.error("Error calling or streaming from Gemini Chat API:", error);
        }
        throw error;
    }
}

/**
 * Calls the OpenAI Chat API (non-streaming).
 *
 * @param {object} env - Environment object containing OPENAI_API_URL and OPENAI_API_KEY.
 * @param {string} promptText - The user's prompt.
 * @param {string | null} [systemPromptText=null] - Optional system prompt text.
 * @returns {Promise<string>} The generated text content.
 * @throws {Error} If OPENAI_API_URL or OPENAI_API_KEY is not set, or if API call fails.
 */
async function callOpenAIChatAPI(env, promptText, systemPromptText = null) {
    if (!env.OPENAI_API_URL) {
        throw new Error("OPENAI_API_URL environment variable is not set.");
    }
    if (!env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY environment variable is not set for OpenAI models.");
    }
    const url = `${env.OPENAI_API_URL}/v1/chat/completions`;
    
    const messages = [];
    if (systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '') {
        messages.push({ role: "system", content: systemPromptText });
        console.log("System instruction included in OpenAI Chat API call.");
    }
    messages.push({ role: "user", content: promptText });

    const modelName = env.DEFAULT_OPEN_MODEL;
    const payload = {
        model: modelName,
        messages: messages,
        temperature: 1,
        max_tokens: 2048,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.OPENAI_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBodyText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorBodyText);
            } catch (e) {
                errorData = errorBodyText;
            }
            console.error("OpenAI Chat API Error Response Body:", typeof errorData === 'object' ? JSON.stringify(errorData, null, 2) : errorData);
            const message = typeof errorData === 'object' && errorData.error?.message
                ? errorData.error.message
                : (typeof errorData === 'string' ? errorData : 'Unknown OpenAI Chat API error');
            throw new Error(`OpenAI Chat API error (${response.status}): ${message}`);
        }

        const data = await response.json();

        if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
            return data.choices[0].message.content;
        } else {
            console.warn("OpenAI Chat API response format unexpected: No choices or content found.", JSON.stringify(data, null, 2));
            throw new Error("OpenAI Chat API returned an empty or malformed response.");
        }
    } catch (error) {
        if (!(error instanceof Error && error.message.startsWith("OpenAI Chat"))) {
            console.error("Error calling OpenAI Chat API (Non-streaming):", error);
        }
        throw error;
    }
}

/**
 * Calls the OpenAI Chat API with streaming.
 *
 * @param {object} env - Environment object containing OPENAI_API_URL and OPENAI_API_KEY.
 * @param {string} promptText - The user's prompt.
 * @param {string | null} [systemPromptText=null] - Optional system prompt text.
 * @returns {AsyncGenerator<string, void, undefined>} An async generator yielding text chunks.
 * @throws {Error} If OPENAI_API_URL or OPENAI_API_KEY is not set, or if API call fails.
 */
async function* callOpenAIChatAPIStream(env, promptText, systemPromptText = null) {
    if (!env.OPENAI_API_URL) {
        throw new Error("OPENAI_API_URL environment variable is not set.");
    }
    if (!env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY environment variable is not set for OpenAI models.");
    }
    const url = `${env.OPENAI_API_URL}/v1/chat/completions`;

    const messages = [];
    if (systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '') {
        messages.push({ role: "system", content: systemPromptText });
        console.log("System instruction included in OpenAI Chat API call.");
    }
    messages.push({ role: "user", content: promptText });

    const modelName = env.DEFAULT_OPEN_MODEL;
    const payload = {
        model: modelName,
        messages: messages,
        temperature: 1,
        max_tokens: 2048,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream: true,
    };

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.OPENAI_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBodyText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorBodyText);
            } catch (e) {
                errorData = errorBodyText;
            }
            console.error("OpenAI Chat API Error (Stream Initial) Response Body:", typeof errorData === 'object' ? JSON.stringify(errorData, null, 2) : errorData);
            const message = typeof errorData === 'object' && errorData.error?.message
                ? errorData.error.message
                : (typeof errorData === 'string' ? errorData : 'Unknown OpenAI Chat API error');
            throw new Error(`OpenAI Chat API error (${response.status}): ${message}`);
        }

        if (!response.body) {
            throw new Error("Response body is null, cannot stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let hasYieldedContent = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            
            // OpenAI streaming uses data: {JSON}\n\n
            let eventBoundary;
            while ((eventBoundary = buffer.indexOf('\n\n')) !== -1) {
                let message = buffer.substring(0, eventBoundary);
                buffer = buffer.substring(eventBoundary + 2); // +2 for '\n\n'

                if (message.startsWith("data: ")) {
                    message = message.substring(5).trim();
                } else {
                    message = message.trim();
                }

                if (message === "" || message === "[DONE]") {
                    continue;
                }
                
                try {
                    const parsedChunk = JSON.parse(message);
                    if (parsedChunk.choices && parsedChunk.choices.length > 0) {
                        const delta = parsedChunk.choices[0].delta;
                        if (delta && delta.content) {
                            hasYieldedContent = true;
                            yield delta.content;
                        }
                    } else if (parsedChunk.error) {
                        console.error("OpenAI Chat API Stream Error Chunk:", JSON.stringify(parsedChunk.error, null, 2));
                        throw new Error(`OpenAI Chat API stream error: ${parsedChunk.error.message || 'Unknown error in stream'}`);
                    }
                } catch (e) {
                    console.warn("Failed to parse JSON chunk from OpenAI stream:", message, e.message);
                    // Continue processing, might be an incomplete chunk
                }
            }
        }

        // Process any remaining data in the buffer
        if (buffer.trim()) {
            let finalMessage = buffer.trim();
            if (finalMessage.startsWith("data: ")) {
                finalMessage = finalMessage.substring(5).trim();
            }
            if (finalMessage !== "" && finalMessage !== "[DONE]") {
                try {
                    const parsedChunk = JSON.parse(finalMessage);
                    if (parsedChunk.choices && parsedChunk.choices.length > 0) {
                        const delta = parsedChunk.choices[0].delta;
                        if (delta && delta.content) {
                            hasYieldedContent = true;
                            yield delta.content;
                        }
                    } else if (parsedChunk.error) {
                        console.error("OpenAI Chat API Stream Error Chunk:", JSON.stringify(parsedChunk.error, null, 2));
                        throw new Error(`OpenAI Chat API stream error: ${parsedChunk.error.message || 'Unknown error in stream'}`);
                    }
                } catch (e) {
                    console.warn("Failed to parse final JSON chunk from OpenAI stream:", finalMessage, e.message);
                }
            }
        }

        if (!hasYieldedContent) {
            console.warn("OpenAI Chat stream finished but no content was yielded.");
            throw new Error("OpenAI Chat stream completed but yielded no content.");
        }

    } catch (error) {
        if (!(error instanceof Error && error.message.startsWith("OpenAI Chat"))) {
            console.error("Error calling or streaming from OpenAI Chat API:", error);
        }
        throw error;
    }
}


/**
 * Calls the Anthropic Chat API (non-streaming).
 *
 * @param {object} env - Environment object containing ANTHROPIC_API_URL and ANTHROPIC_API_KEY.
 * @param {string} promptText - The user's prompt.
 * @param {string | null} [systemPromptText=null] - Optional system prompt text.
 * @returns {Promise<string>} The generated text content.
 * @throws {Error} If API call fails.
 */
async function callAnthropicChatAPI(env, promptText, systemPromptText = null) {
    if (!env.ANTHROPIC_API_URL || !env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_URL or ANTHROPIC_API_KEY not set.");
    }
    const modelName = env.DEFAULT_ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    const url = `${env.ANTHROPIC_API_URL}/v1/messages`;

    const messages = [{ role: "user", content: promptText }];
    
    const payload = {
        model: modelName,
        messages: messages,
        max_tokens: 2048
    };

    if (systemPromptText && systemPromptText.trim() !== '') {
        // Anthropic 中转不支持 system 参数，将其融入 user 消息
        payload.messages[0].content = `${systemPromptText}\n\n${promptText}`;
    }

    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.ANTHROPIC_API_KEY}`,
                'User-Agent': 'Cloudflare-Worker/1.0'
            },
            body: JSON.stringify(payload)
        }, 180000);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic Chat API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        // Filter out thinking blocks and only return text content
        if (data.content && Array.isArray(data.content)) {
            const textBlocks = data.content
                .filter(block => block.type === 'text' && block.text)
                .map(block => block.text);

            if (textBlocks.length > 0) {
                return textBlocks.join('\n');
            }
        }

        throw new Error("Anthropic Chat API returned no content.");
    } catch (error) {
        console.error("Error calling Anthropic Chat API:", error);
        throw error;
    }
}


/**
 * Calls the Anthropic Chat API with streaming.
 *
 * @param {object} env - Environment object.
 * @param {string} promptText - The user's prompt.
 * @param {string | null} [systemPromptText=null] - Optional system prompt text.
 * @returns {AsyncGenerator<string, void, undefined>} An async generator yielding text chunks.
 * @throws {Error} If API call fails.
 */
async function* callAnthropicChatAPIStream(env, promptText, systemPromptText = null) {
    if (!env.ANTHROPIC_API_URL || !env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_URL or ANTHROPIC_API_KEY not set.");
    }
    const modelName = env.DEFAULT_ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    const url = `${env.ANTHROPIC_API_URL}/v1/messages`;

    const messages = [{ role: "user", content: promptText }];
    
    const payload = {
        model: modelName,
        messages: messages,
        max_tokens: 2048,
        stream: true
    };

    if (systemPromptText && systemPromptText.trim() !== '') {
        payload.messages[0].content = `${systemPromptText}\n\n${promptText}`;
    }

    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.ANTHROPIC_API_KEY}`,
                'User-Agent': 'Cloudflare-Worker/1.0'
            },
            body: JSON.stringify(payload)
        }, 180000);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic Chat API error (${response.status}): ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let hasYieldedContent = false;
        let currentBlockType = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim() || !line.startsWith('data: ')) continue;
                const data = line.substring(6).trim();
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);

                    // Track the type of the current content block
                    if (parsed.type === 'content_block_start') {
                        currentBlockType = parsed.content_block?.type;
                    } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                        // Only yield text if the current block is not a thinking block
                        if (currentBlockType !== 'thinking') {
                            hasYieldedContent = true;
                            yield parsed.delta.text;
                        }
                    } else if (parsed.type === 'content_block_stop') {
                        currentBlockType = null;
                    } else if (parsed.type === 'error') {
                        throw new Error(`Anthropic stream error: ${parsed.error?.message || 'Unknown'}`);
                    }
                } catch (e) {
                    console.warn("Failed to parse Anthropic stream chunk:", data, e.message);
                }
            }
        }

        if (!hasYieldedContent) {
            throw new Error("Anthropic stream completed but yielded no content.");
        }
    } catch (error) {
        console.error("Error calling Anthropic Chat API Stream:", error);
        throw error;
    }
}


/**
 * Main function to call the appropriate chat API (Gemini or OpenAI) based on model name.
 * Defaults to Gemini if no specific API is indicated in the model name.
 *
 * @param {object} env - Environment object.
 * @param {string} promptText - The user's prompt.
 * @param {string | null} [systemPromptText=null] - Optional system prompt text.
 * @returns {Promise<string>} The generated text content.
 * @throws {Error} If API keys/URLs are not set, or if API call fails.
 */
export async function callChatAPI(env, promptText, systemPromptText = null) {
    const platform = env.USE_MODEL_PLATFORM;
    if (platform.startsWith("OPEN")) {
        return callOpenAIChatAPI(env, promptText, systemPromptText);
    } else if (platform.startsWith("ANTHROPIC")) {
        return callAnthropicChatAPI(env, promptText, systemPromptText);
    } else { // Default to Gemini
        try {
            return await callGeminiChatAPI(env, promptText, systemPromptText);
        } catch (error) {
            if (isRateLimitError(error) && canUseAnthropicFallback(env)) {
                console.warn("Gemini rate limit encountered; falling back to Anthropic.");
                return await callAnthropicChatAPI(env, promptText, systemPromptText);
            }
            throw error;
        }
    }
}

/**
 * Main function to call the appropriate chat API (Gemini or OpenAI) with streaming.
 * Defaults to Gemini if no specific API is indicated in the model name.
 *
 * @param {object} env - Environment object.
 * @param {string} promptText - The user's prompt.
 * @param {string | null} [systemPromptText=null] - Optional system prompt text.
 * @returns {AsyncGenerator<string, void, undefined>} An async generator yielding text chunks.
 * @throws {Error} If API keys/URLs are not set, or if API call fails.
 */
export async function* callChatAPIStream(env, promptText, systemPromptText = null) {
    const platform = env.USE_MODEL_PLATFORM;
    if (platform.startsWith("OPEN")) {
        yield* callOpenAIChatAPIStream(env, promptText, systemPromptText);
    } else if (platform.startsWith("ANTHROPIC")) {
        yield* callAnthropicChatAPIStream(env, promptText, systemPromptText);
    } else { // Default to Gemini
        const streamMode = getGeminiStreamMode(env);
        if (streamMode === "off") {
            try {
                const text = await callGeminiChatAPI(env, promptText, systemPromptText);
                yield text;
                return;
            } catch (error) {
                if (isRateLimitError(error) && canUseAnthropicFallback(env)) {
                    console.warn("Gemini rate limit encountered; falling back to Anthropic.");
                    const text = await callAnthropicChatAPI(env, promptText, systemPromptText);
                    yield text;
                    return;
                }
                throw error;
            }
        }
        try {
            yield* callGeminiChatAPIStream(env, promptText, systemPromptText);
        } catch (error) {
            if (isRateLimitError(error) && canUseAnthropicFallback(env)) {
                console.warn("Gemini rate limit encountered; falling back to Anthropic.");
                const text = await callAnthropicChatAPI(env, promptText, systemPromptText);
                yield text;
                return;
            }
            throw error;
        }
    }
}


/**
 * 带有超时功能的 fetch 封装
 * @param {string} resource fetch 的请求 URL
 * @param {object} options fetch 的配置对象
 * @param {number} timeout 超时时间，单位毫秒
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(resource, options = {}, timeout = 180000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal  // 关联 AbortController
    });
    return response;
  } catch (error) {
    // 当 abort() 被调用时，fetch 会抛出一个 AbortError
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    // 其他网络错误等
    throw error;
  } finally {
    // 清除计时器，防止内存泄漏
    clearTimeout(id);
  }
}
