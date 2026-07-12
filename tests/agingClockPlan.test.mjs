import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgingClockPlanFallback,
  validateAgingClockPlan,
  validateAgingClockPlanRequest,
} from "../src/agingClockPlan.js";
import { createAgingClockPlanHandler } from "../src/handlers/agingClockPlan.js";

const requestBody = {
  projectId: "epiage-skill",
  role: "indie-developer",
  direction: "education",
  timeBudget: "seven-days",
  experience: "intermediate",
  deployment: "static-site",
  goal: "做一个不处理个人数据的衰老时钟教育页",
};

function request(body = requestBody, options = {}) {
  const method = options.method || "POST";
  const headers = new Headers();
  if (options.contentType !== null) {
    headers.set("Content-Type", options.contentType || "application/json");
  }
  if (options.origin !== null) {
    headers.set("Origin", options.origin || "http://localhost:4321");
  }
  if (options.ip !== null) {
    headers.set("CF-Connecting-IP", options.ip || "203.0.113.10");
  }
  return new Request("https://worker.example/api/project-lab/aging-clock-plan", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

function rawRequest(body, options = {}) {
  return new Request("https://worker.example/api/project-lab/aging-clock-plan", {
    method: "POST",
    headers: {
      "Content-Type": options.contentType || "application/json",
      Origin: options.origin || "http://localhost:4321",
    },
    body,
  });
}

function configuredEnv(overrides = {}) {
  return {
    PROJECT_LAB_AI_ENABLED: "true",
    ANTHROPIC_API_KEY: "unit-test-primary-placeholder",
    ANTHROPIC_BACKUP_API_KEY: "unit-test-backup-placeholder",
    ANTHROPIC_API_BASE_URL: "https://primary.example",
    ANTHROPIC_BACKUP_API_BASE_URL: "https://backup.example/custom",
    DEFAULT_ANTHROPIC_MODEL: "unit-test-primary-model",
    DEFAULT_ANTHROPIC_BACKUP_MODEL: "unit-test-backup-model",
    OPENAI_API_KEY: "unit-test-openai-placeholder",
    OPENAI_API_URL: "https://openai-fallback.example",
    ...overrides,
  };
}

function validPlan() {
  const validated = validateAgingClockPlanRequest(requestBody);
  assert.equal(validated.ok, true);
  return createAgingClockPlanFallback(validated.value);
}

function modelJson(plan = validPlan()) {
  return `\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``;
}

function providerError(status) {
  const error = new Error("provider_failure");
  error.status = status;
  return error;
}

function createKv() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) || null;
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
}

test("request and deterministic fallback schemas are valid", () => {
  const validated = validateAgingClockPlanRequest(requestBody);
  assert.equal(validated.ok, true);
  assert.equal(
    validateAgingClockPlan(createAgingClockPlanFallback(validated.value)).ok,
    true
  );
});

test("strict request validation rejects enums, extra fields, PII, and long goals", () => {
  for (const body of [
    { ...requestBody, role: "doctor" },
    { ...requestBody, biologicalData: "not allowed" },
    { ...requestBody, goal: "联系 test@example.com" },
    { ...requestBody, goal: "x".repeat(241) },
  ]) {
    assert.equal(validateAgingClockPlanRequest(body).ok, false);
  }
});

test("CORS preflight is allow-listed and rejects an unknown origin", async () => {
  const handler = createAgingClockPlanHandler();
  const allowed = await handler(request(undefined, { method: "OPTIONS" }), {});
  assert.equal(allowed.status, 204);
  assert.equal(
    allowed.headers.get("Access-Control-Allow-Origin"),
    "http://localhost:4321"
  );

  const denied = await handler(
    request(undefined, {
      method: "OPTIONS",
      origin: "https://evil.example",
    }),
    {}
  );
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "origin_not_allowed");
});

test("method, media type, malformed JSON, invalid fields, and body limits return structured errors", async () => {
  const handler = createAgingClockPlanHandler();
  const method = await handler(request(undefined, { method: "GET" }), {});
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("Allow"), "POST, OPTIONS");

  const mediaType = await handler(
    request(requestBody, { contentType: "text/plain" }),
    {}
  );
  assert.equal(mediaType.status, 415);

  const malformed = await handler(rawRequest("{not-json"), {});
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, "invalid_json");

  const invalid = await handler(
    request({ ...requestBody, projectId: "unknown" }),
    {}
  );
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.details.field, "projectId");

  const oversized = await handler(
    request({ ...requestBody, goal: "x".repeat(17_000) }),
    { PROJECT_LAB_MAX_BODY_BYTES: "16384" }
  );
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "request_too_large");
});

test("AI disabled or unconfigured returns an explicit server fallback without a model call", async () => {
  let calls = 0;
  const handler = createAgingClockPlanHandler({
    callChat: async () => {
      calls += 1;
      return modelJson();
    },
  });

  for (const env of [
    configuredEnv({ PROJECT_LAB_AI_ENABLED: "false" }),
    configuredEnv({ PROJECT_LAB_AI_ENABLED: undefined }),
    { PROJECT_LAB_AI_ENABLED: "true" },
  ]) {
    const response = await handler(request(), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.resultSource, "server-fallback");
    assert.equal(validateAgingClockPlan(body.plan).ok, true);
  }
  assert.equal(calls, 0);
});

test("primary model success is labeled model and is called exactly once", async () => {
  const calls = [];
  const handler = createAgingClockPlanHandler({
    callChat: async env => {
      calls.push(env);
      return modelJson();
    },
  });
  const response = await handler(
    request(),
    configuredEnv({ PROJECT_LAB_PRIMARY_TIMEOUT_MS: "24000" })
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.resultSource, "model");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ANTHROPIC_API_BASE_URL, "https://primary.example");
  assert.equal(calls[0].DEFAULT_ANTHROPIC_MODEL, "unit-test-primary-model");
  assert.equal(calls[0].ANTHROPIC_RETRY_MAX, "0");
  assert.equal(calls[0].ANTHROPIC_MAX_TOKENS, "1200");
  assert.equal(calls[0].ANTHROPIC_REQUEST_TIMEOUT_MS, "24000");
  assert.equal(calls[0].ANTHROPIC_BACKUP_API_KEY, "");
  assert.equal(calls[0].OPENAI_API_KEY, "");
  assert.equal(calls[0].OPENAI_API_URL, "");
});

test("401, 429, and 5xx primary failures each attempt the backup model once", async () => {
  for (const status of [401, 429, 503]) {
    const calls = [];
    const handler = createAgingClockPlanHandler({
      callChat: async env => {
        calls.push(env);
        if (calls.length === 1) throw providerError(status);
        return modelJson();
      },
    });
    const response = await handler(request(), configuredEnv());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.resultSource, "backup-model");
    assert.equal(calls.length, 2);
    assert.equal(
      calls[1].ANTHROPIC_API_BASE_URL,
      "https://backup.example/custom"
    );
    assert.equal(
      calls[1].DEFAULT_ANTHROPIC_MODEL,
      "unit-test-backup-model"
    );
  }
});

test("primary and backup failure returns server-fallback after exactly two calls", async () => {
  let calls = 0;
  const handler = createAgingClockPlanHandler({
    callChat: async () => {
      calls += 1;
      throw providerError(calls === 1 ? 429 : 503);
    },
  });
  const response = await handler(request(), configuredEnv());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.resultSource, "server-fallback");
  assert.equal(calls, 2);
  assert.equal(validateAgingClockPlan(body.plan).ok, true);
});

test("invalid JSON and medical output are rejected before falling back", async () => {
  const unsafePlan = {
    ...validPlan(),
    mvpFeatures: [...validPlan().mvpFeatures, "提供疾病诊断和治疗方案"],
  };
  let calls = 0;
  const handler = createAgingClockPlanHandler({
    callChat: async () => {
      calls += 1;
      return calls === 1 ? "not json" : JSON.stringify(unsafePlan);
    },
  });
  const response = await handler(request(), configuredEnv());
  const body = await response.json();
  assert.equal(body.resultSource, "server-fallback");
  assert.equal(calls, 2);
  assert.equal(JSON.stringify(body).includes("提供疾病诊断和治疗方案"), false);
});

test("the total model timeout is capped and fails safely", async () => {
  const handler = createAgingClockPlanHandler({
    callChat: () => new Promise(() => {}),
  });
  const response = await handler(
    request(),
    configuredEnv({
      ANTHROPIC_BACKUP_API_KEY: "",
      PROJECT_LAB_TIMEOUT_MS: "1000",
    })
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.resultSource, "server-fallback");
  assert.match(body.message, /超时/);
});

test("a stalled primary keeps time available for one backup attempt", async () => {
  let calls = 0;
  const handler = createAgingClockPlanHandler({
    callChat: async () => {
      calls += 1;
      if (calls === 1) return new Promise(() => {});
      return JSON.stringify(validPlan());
    },
  });
  const response = await handler(
    request(),
    configuredEnv({ PROJECT_LAB_TIMEOUT_MS: "4000" })
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.resultSource, "backup-model");
  assert.equal(calls, 2);
  assert.equal(validateAgingClockPlan(body.plan).ok, true);
});

test("Rate Limiting Binding rejects the sixth request and handles a missing IP", async () => {
  let count = 0;
  const keys = [];
  const limiter = {
    async limit({ key }) {
      keys.push(key);
      count += 1;
      return { success: count <= 5 };
    },
  };
  const handler = createAgingClockPlanHandler();
  const env = {
    PROJECT_LAB_AI_ENABLED: "false",
    PROJECT_LAB_RATE_LIMITER: limiter,
  };

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal(
      (await handler(request(requestBody, { ip: null }), env)).status,
      200
    );
  }
  const limited = await handler(request(requestBody, { ip: null }), env);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
  assert.equal((await limited.json()).error.code, "rate_limit_exceeded");
  assert.deepEqual(new Set(keys), new Set(["aging-clock-plan:unknown"]));
});

test("KV rate limiting remains a fallback only when the binding is absent", async () => {
  const handler = createAgingClockPlanHandler();
  const env = {
    PROJECT_LAB_AI_ENABLED: "false",
    DATA_KV: createKv(),
    PROJECT_LAB_RATE_LIMIT: "1",
  };
  assert.equal((await handler(request(), env)).status, 200);
  const limited = await handler(request(), env);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, "rate_limit_exceeded");
});
