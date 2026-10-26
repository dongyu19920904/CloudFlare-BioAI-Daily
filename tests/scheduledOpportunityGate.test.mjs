import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Load the real scheduled handler, replacing only model/source/GitHub I/O.
// The two extensionless imports are supported by Wrangler; resolve them here
// without changing production imports just to satisfy the Node test loader.
const replacements = new Map([
  [new URL('../src/chatapi.js', import.meta.url).href, `
    export async function callChatAPI(_env, prompt) { return globalThis.__bioaiGateFixture.generate(prompt); }
    export async function* callChatAPIStream(_env, prompt) { yield await globalThis.__bioaiGateFixture.generate(prompt); }
    export function resolveAnthropicConfig() { return {}; }
  `],
  [new URL('../src/dataFetchers.js', import.meta.url).href, `
    export const dataSources = {news:{}, paper:{}, project:{}, socialMedia:{}};
    export async function fetchAllData() { return {news:[],paper:[],project:[],socialMedia:[]}; }
  `],
  [new URL('../src/github.js', import.meta.url).href, `
    export async function getGitHubFileSha() { return null; }
    export async function getGitHubFileContent() { return ''; }
    export async function createOrUpdateGitHubFile(_env, path, content) {
      const state = globalThis.__bioaiGateFixture;
      if (state.failWrite) throw new Error('fixture write failed');
      state.writes.push({path,content});
    }
  `],
]);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (/summarizationPromptStep(?:Zero|Three)$/.test(specifier)) return next(`${specifier}.js`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    return replacements.has(url) ? { format: 'module', source: replacements.get(url), shortCircuit: true } : next(url, context);
  },
});
const scheduled = await import('../src/handlers/scheduled.js');
hooks.deregister();

const date = '2026-10-26';
const env = { DATA_KV: { get: async () => null, put: async () => {} } };
const materials = { news: [{ type: 'news', title: '研究资料', url: 'https://example.org/study', details: { content_html: '研究素材，尚无临床结论。' } }] };
const valid = '## 今日主推\n### 研究资料整理\n- 证据来源：https://example.org/study\n- 可交付物：研究来源、证据阶段与局限资料库。';
const unsafe = `${valid}\n## 今天别碰\n不要制作健康自测清单。`;

function setup(t, drafts) {
  const state = { calls: [], writes: [], drafts: [...drafts] };
  state.generate = async prompt => {
    assert.equal(state.writes.length, 0, 'no publication writes during either model attempt');
    state.calls.push(prompt);
    return state.drafts.shift();
  };
  globalThis.__bioaiGateFixture = state;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>No DOI</html>', { status: 200 });
  t.after(() => { globalThis.fetch = originalFetch; delete globalThis.__bioaiGateFixture; });
  return state;
}

test('scheduled opportunity publishes records/page/index only after a targeted second draft passes', async t => {
  const state = setup(t, [unsafe, valid]);
  const result = await scheduled.handleScheduledOpportunity({}, env, {}, date, materials);
  assert.equal(result.success, true);
  assert.equal(state.calls.length, 2);
  assert.match(state.calls[1], /失败草稿/);
  assert.match(state.calls[1], /今天别碰/);
  assert.match(state.calls[1], /健康自测清单/);
  assert.equal(result.selectedCount, 1);
  assert.equal(result.records.count, 1);
  assert.deepEqual(state.writes.map(item => item.path), [
    'static/data/opportunities/opportunity/2026-10-26.json',
    'content/cn/opportunity/2026-10/2026-10-26.md',
    'content/cn/opportunity/2026-10/_index.md',
    'content/cn/opportunity/_index.md',
  ]);
  assert.equal(JSON.parse(state.writes[0].content).opportunities[0].source_urls[0], 'https://example.org/study');
  assert.ok(state.writes.slice(1).every(item => !item.content.includes('健康自测清单')));
});

test('two failed opportunity attempts return failure diagnostics with zero publication writes', async t => {
  const state = setup(t, [unsafe, unsafe]);
  const result = await scheduled.handleScheduledOpportunity({}, env, {}, date, materials);
  assert.equal(result.success, false);
  assert.equal(state.calls.length, 2);
  assert.deepEqual(state.writes, []);
  assert.equal(result.gate_diagnostics.length, 2);
  assert.equal(result.gate_diagnostics[1].health_hits[0].section, '今天别碰');
  assert.doesNotMatch(JSON.stringify(result), /https:\/\/example.org\/study|## 今日主推/);
});

test('a sourced software installation check publishes on the first attempt', async t => {
  const state = setup(t, [`${valid}\n## 健康研究工具\n可交付物：工具安装自测，检查依赖和接口响应。`]);
  const result = await scheduled.handleScheduledOpportunity({}, env, {}, date, materials);
  assert.equal(result.success, true);
  assert.equal(result.records.count, 1);
  assert.equal(state.calls.length, 1);
  assert.equal(state.writes.length, 4);
});

test('missing and fabricated main sources both fail twice without any publication writes', async t => {
  const state = setup(t, [valid.replace('https://example.org/study', '未提供'), valid.replace('/study', '/fabricated')]);
  const result = await scheduled.handleScheduledOpportunity({}, env, {}, date, materials);
  assert.equal(result.success, false);
  assert.equal(state.calls.length, 2);
  assert.deepEqual(state.writes, []);
});

test('opportunity no-main-item text is not converted into empty publication success', async t => {
  const empty = '## 今日主推\n今日未筛出合格主推。';
  const state = setup(t, [empty, empty]);
  const result = await scheduled.handleScheduledOpportunity({}, env, {}, date, materials);
  assert.equal(result.success, false);
  assert.match(result.error, /no_main_items/);
  assert.deepEqual(state.writes, []);
});

test('project-opportunity still publishes an actual extracted record with its own page paths', async t => {
  const state = setup(t, [valid.replace('今日主推', '今日优先项目')]);
  const result = await scheduled.handleScheduledProjectOpportunity({}, env, {}, date, materials);
  assert.equal(result.success, true);
  assert.equal(result.records.count, 1);
  assert.equal(state.calls.length, 1);
  assert.equal(state.writes.length, 4);
  assert.ok(state.writes.every(item => item.path.includes('project-opportunity')));
});

test('named risky project is not replaced by an empty report and writes remain zero', async t => {
  const draft = unsafe.replace('今日主推', '今日优先项目');
  const state = setup(t, [draft, draft]);
  const result = await scheduled.handleScheduledProjectOpportunity({}, env, {}, date, materials);
  assert.equal(result.success, false);
  assert.equal(state.calls.length, 2);
  assert.deepEqual(state.writes, []);
});

test('daily no-items contract is unchanged and makes no model or publication call', async t => {
  const state = setup(t, []);
  const result = await scheduled.handleScheduledDaily({}, env, {}, date, { dryRun: true });
  assert.deepEqual(result, { success: false, date, reason: 'no_items' });
  assert.deepEqual(state.calls, []);
  assert.deepEqual(state.writes, []);
});

test('record write failure is not success and cannot proceed to page/index publication', async t => {
  const state = setup(t, [valid]);
  state.failWrite = true;
  const result = await scheduled.handleScheduledOpportunity({}, env, {}, date, materials);
  assert.equal(result.success, false);
  assert.match(result.error, /fixture write failed/);
  assert.deepEqual(state.writes, []);
});
