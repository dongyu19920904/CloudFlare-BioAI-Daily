import { callChatAPI, resolveAnthropicConfig } from "../chatapi.js";
import {
  createAgingClockPlanFallback,
  parseAgingClockPlan,
  validateAgingClockPlanRequest,
} from "../agingClockPlan.js";
import {
  AGING_CLOCK_PLAN_SYSTEM_PROMPT,
  buildAgingClockPlanUserPrompt,
} from "../prompt/agingClockPlanPrompt.js";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://yuyu.aivora.cn",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];
const ROUTE_RATE_LIMIT_KEY = "aging-clock-plan";
const RATE_LIMIT_PERIOD_SECONDS = 60;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function enabledFromEnv(value) {
  return ["true", "1", "yes", "on"].includes(
    String(value || "")
      .trim()
      .toLowerCase()
  );
}

function allowedOrigins(env) {
  const configured = String(env.PROJECT_LAB_ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = allowedOrigins(env);
  const responseOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function jsonResponse(request, env, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request, env), ...extraHeaders },
  });
}

function errorResponse(
  request,
  env,
  status,
  code,
  message,
  details = undefined,
  extraHeaders = {}
) {
  return jsonResponse(
    request,
    env,
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    status,
    extraHeaders
  );
}

function originIsAllowed(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || allowedOrigins(env).includes(origin);
}

async function hashIdentifier(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function enforceRateLimit(request, env, now) {
  const client = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  const routeKey = `${ROUTE_RATE_LIMIT_KEY}:${client}`;

  if (
    env.PROJECT_LAB_RATE_LIMITER &&
    typeof env.PROJECT_LAB_RATE_LIMITER.limit === "function"
  ) {
    try {
      const result = await env.PROJECT_LAB_RATE_LIMITER.limit({ key: routeKey });
      return { allowed: result?.success === true, unavailable: false };
    } catch {
      return { allowed: false, unavailable: true };
    }
  }

  if (!env.DATA_KV || typeof env.DATA_KV.get !== "function") {
    return { allowed: true, unavailable: false };
  }

  try {
    const limit = boundedInteger(env.PROJECT_LAB_RATE_LIMIT, 5, 1, 30);
    const minute = Math.floor(now() / 60_000);
    const key = `project-lab:${ROUTE_RATE_LIMIT_KEY}:${minute}:${await hashIdentifier(
      client
    )}`;
    const current =
      Number.parseInt((await env.DATA_KV.get(key)) || "0", 10) || 0;
    if (current >= limit) return { allowed: false, unavailable: false };
    await env.DATA_KV.put(key, String(current + 1), { expirationTtl: 120 });
    return { allowed: true, unavailable: false };
  } catch {
    return { allowed: false, unavailable: true };
  }
}

function providerConfiguration(env) {
  const resolved = resolveAnthropicConfig(env);
  const primary = {
    ...resolved.primary,
    apiKey: env.ANTHROPIC_API_KEY || "",
  };
  const backup = {
    ...resolved.backup,
    apiKey: env.ANTHROPIC_BACKUP_API_KEY || "",
  };
  return {
    primary,
    backup,
    primaryConfigured: Boolean(
      primary.apiKey && primary.messagesUrl && primary.modelName
    ),
    backupConfigured: Boolean(
      backup.apiKey && backup.messagesUrl && backup.modelName
    ),
  };
}

function logConfiguration(aiEnabled, providers) {
  console.log(`AI enabled: ${aiEnabled}`);
  console.log(`Primary model configured: ${providers.primaryConfigured}`);
  console.log(`Backup model configured: ${providers.backupConfigured}`);
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("project_lab_timeout")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function modelEnvironment(env, route, maxTokens, timeoutMs) {
  return {
    ...env,
    USE_MODEL_PLATFORM: "ANTHROPIC",
    ANTHROPIC_API_BASE_URL: route.baseUrl,
    ANTHROPIC_API_URL: "",
    ANTHROPIC_BASE_URL: "",
    ANTHROPIC_BACKUP_API_BASE_URL: "",
    ANTHROPIC_BACKUP_API_URL: "",
    ANTHROPIC_BACKUP_BASE_URL: "",
    ANTHROPIC_API_KEY: route.apiKey,
    ANTHROPIC_BACKUP_API_KEY: "",
    DEFAULT_ANTHROPIC_MODEL: route.modelName,
    DEFAULT_ANTHROPIC_BACKUP_MODEL: route.modelName,
    FALLBACK_ANTHROPIC_MODEL: route.modelName,
    ANTHROPIC_MAX_TOKENS: String(maxTokens),
    ANTHROPIC_REQUEST_TIMEOUT_MS: String(timeoutMs),
    ANTHROPIC_RETRY_MAX: "0",
    OPENAI_FALLBACK_ENABLED: "false",
    OPENAI_API_KEY: "",
    OPENAI_API_URL: "",
    OPENAI_BASE_URL: "",
  };
}

async function attemptModel({
  callChat,
  env,
  route,
  request,
  deadline,
  attemptTimeoutMs,
  maxTokens,
}) {
  const remainingMs = Math.min(
    deadline - Date.now(),
    attemptTimeoutMs || Number.POSITIVE_INFINITY
  );
  if (remainingMs < 1000) throw new Error("project_lab_timeout");
  const raw = await withTimeout(
    callChat(
      modelEnvironment(env, route, maxTokens, remainingMs),
      buildAgingClockPlanUserPrompt(request),
      AGING_CLOCK_PLAN_SYSTEM_PROMPT
    ),
    remainingMs
  );
  const parsed = parseAgingClockPlan(raw);
  if (!parsed.ok) {
    const error = new Error("invalid_model_output");
    error.code = "invalid_model_output";
    throw error;
  }
  return parsed.value;
}

function classifyProviderFailure(error) {
  if (
    error?.code === "invalid_model_output" ||
    error?.message === "invalid_model_output"
  ) {
    return "invalid_output";
  }
  if (error?.message === "project_lab_timeout") return "timeout";
  const status = Number(error?.status);
  if (status === 401 || status === 403) return "provider_auth";
  if (status === 429) return "provider_rate_limit";
  if (status >= 500) return "provider_5xx";
  return "provider_error";
}

function fallbackMessage(reason) {
  const messages = {
    ai_disabled: "实时 AI 当前已关闭，已返回确定性的服务端模板。",
    not_configured: "模型服务配置不完整，已返回确定性的服务端模板。",
    timeout: "模型服务超时，已返回确定性的服务端模板。",
    invalid_output:
      "模型结果未通过 JSON 结构或安全校验，已返回确定性的服务端模板。",
    provider_auth: "模型服务鉴权失败，已返回确定性的服务端模板。",
    provider_rate_limit: "模型服务限流，已返回确定性的服务端模板。",
    provider_5xx: "模型服务暂时异常，已返回确定性的服务端模板。",
    provider_error: "模型服务不可用，已返回确定性的服务端模板。",
  };
  return messages[reason] || messages.provider_error;
}

function serverFallbackResponse(request, env, plan, reason) {
  return jsonResponse(request, env, {
    resultSource: "server-fallback",
    message: fallbackMessage(reason),
    plan,
  });
}

export function createAgingClockPlanHandler({
  callChat = callChatAPI,
  now = () => Date.now(),
} = {}) {
  return async function handleAgingClockPlan(request, env) {
    if (!originIsAllowed(request, env)) {
      return errorResponse(
        request,
        env,
        403,
        "origin_not_allowed",
        "请求 Origin 不在允许列表中。"
      );
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }
    if (request.method !== "POST") {
      return errorResponse(
        request,
        env,
        405,
        "method_not_allowed",
        "仅支持 POST 请求。",
        undefined,
        { Allow: "POST, OPTIONS" }
      );
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return errorResponse(
        request,
        env,
        415,
        "json_content_type_required",
        "Content-Type 必须是 application/json。"
      );
    }

    const maxBodyBytes = boundedInteger(
      env.PROJECT_LAB_MAX_BODY_BYTES,
      16_384,
      1024,
      65_536
    );
    const declaredLength = Number.parseInt(
      request.headers.get("Content-Length") || "0",
      10
    );
    if (declaredLength > maxBodyBytes) {
      return errorResponse(
        request,
        env,
        413,
        "request_too_large",
        "请求体超过允许大小。"
      );
    }

    let text;
    try {
      text = await request.text();
    } catch {
      return errorResponse(
        request,
        env,
        400,
        "invalid_request_body",
        "无法读取请求体。"
      );
    }
    if (new TextEncoder().encode(text).byteLength > maxBodyBytes) {
      return errorResponse(
        request,
        env,
        413,
        "request_too_large",
        "请求体超过允许大小。"
      );
    }

    let input;
    try {
      input = JSON.parse(text);
    } catch {
      return errorResponse(
        request,
        env,
        400,
        "invalid_json",
        "请求体不是有效 JSON。"
      );
    }
    const validated = validateAgingClockPlanRequest(input);
    if (!validated.ok) {
      return errorResponse(
        request,
        env,
        400,
        "invalid_request",
        validated.message,
        { field: validated.field }
      );
    }

    const rateLimit = await enforceRateLimit(request, env, now);
    if (rateLimit.unavailable) {
      return errorResponse(
        request,
        env,
        503,
        "rate_limit_unavailable",
        "费用保护服务暂不可用，请稍后重试。",
        undefined,
        { "Retry-After": String(RATE_LIMIT_PERIOD_SECONDS) }
      );
    }
    if (!rateLimit.allowed) {
      return errorResponse(
        request,
        env,
        429,
        "rate_limit_exceeded",
        "请求过于频繁，请稍后重试。",
        undefined,
        { "Retry-After": String(RATE_LIMIT_PERIOD_SECONDS) }
      );
    }

    const fallback = createAgingClockPlanFallback(validated.value);
    const providers = providerConfiguration(env);
    const aiEnabled = enabledFromEnv(env.PROJECT_LAB_AI_ENABLED);
    logConfiguration(aiEnabled, providers);

    if (!aiEnabled) {
      return serverFallbackResponse(
        request,
        env,
        fallback,
        "ai_disabled"
      );
    }
    if (!providers.primaryConfigured && !providers.backupConfigured) {
      return serverFallbackResponse(
        request,
        env,
        fallback,
        "not_configured"
      );
    }

    const timeoutMs = boundedInteger(
      env.PROJECT_LAB_TIMEOUT_MS,
      30_000,
      1000,
      30_000
    );
    const maxTokens = boundedInteger(
      env.PROJECT_LAB_MAX_TOKENS,
      1200,
      400,
      4000
    );
    // Keep a bounded part of the public request budget for the independent
    // backup route. Production can tune the primary slice without increasing
    // the overall timeout or adding retries.
    const deadline = Date.now() + Math.max(1000, timeoutMs - 750);
    const defaultPrimaryAttemptTimeoutMs = providers.backupConfigured
      ? Math.max(1000, Math.floor(timeoutMs * 0.3))
      : timeoutMs;
    const primaryAttemptTimeoutMs = providers.backupConfigured
      ? boundedInteger(
          env.PROJECT_LAB_PRIMARY_TIMEOUT_MS,
          defaultPrimaryAttemptTimeoutMs,
          1000,
          timeoutMs
        )
      : timeoutMs;
    let failureReason = providers.primaryConfigured
      ? "provider_error"
      : "not_configured";

    if (providers.primaryConfigured) {
      try {
        const plan = await attemptModel({
          callChat,
          env,
          route: providers.primary,
          request: validated.value,
          deadline,
          attemptTimeoutMs: primaryAttemptTimeoutMs,
          maxTokens,
        });
        return jsonResponse(request, env, {
          resultSource: "model",
          message: "",
          plan,
        });
      } catch (error) {
        failureReason = classifyProviderFailure(error);
      }
    }

    if (providers.backupConfigured) {
      try {
        const plan = await attemptModel({
          callChat,
          env,
          route: providers.backup,
          request: validated.value,
          deadline,
          attemptTimeoutMs: timeoutMs,
          maxTokens,
        });
        return jsonResponse(request, env, {
          resultSource: "backup-model",
          message: "",
          plan,
        });
      } catch (error) {
        failureReason = classifyProviderFailure(error);
      }
    }

    return serverFallbackResponse(
      request,
      env,
      fallback,
      failureReason
    );
  };
}

export const handleAgingClockPlan = createAgingClockPlanHandler();
