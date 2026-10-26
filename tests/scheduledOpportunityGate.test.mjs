import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

// Load the real scheduled handler, replacing only model/source/GitHub I/O.
// The two extensionless imports are supported by Wrangler; resolve them here
// without changing production imports just to satisfy the Node test loader.
const replacements = new Map([
  [new URL('../src/chatapi.js', import.meta.url).href, `
    export async function callChatAPI(_env, prompt, system) { return globalThis.__bioaiGateFixture.generate(prompt, system); }
    export async function* callChatAPIStream(_env, prompt, system) { yield await globalThis.__bioaiGateFixture.generate(prompt, system); }
    export function resolveAnthropicConfig() { return {}; }
  `],
  [new URL('../src/dataFetchers.js', import.meta.url).href, `
    export const dataSources = {news:{}, paper:{}, project:{}, socialMedia:{}};
    export async function fetchAllData() { return globalThis.__bioaiGateFixture.materials || {news:[],paper:[],project:[],socialMedia:[]}; }
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
  const state = { calls: [], systems: [], writes: [], drafts: [...drafts] };
  state.generate = async (prompt, system) => {
    assert.equal(state.writes.length, 0, 'no publication writes during either model attempt');
    state.calls.push(prompt);
    state.systems.push(system);
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

const columnFixture = section => readFileSync(new URL(`./fixtures/bio-columns/${section}.md`, import.meta.url), 'utf8');
// Optional, explicit artifact export for offline Hugo review, never GitHub I/O.
function exportColumnFixture(section, state, result) {
  if (!process.env.BIOAI_FIXTURE_OUTPUT_DIR) return;
  const root = resolve(process.env.BIOAI_FIXTURE_OUTPUT_DIR);
  const allowed = resolve('D:/CodexCache/artifacts') + sep;
  assert.ok(root.toLowerCase().startsWith(allowed.toLowerCase()), 'fixture artifacts must stay in the D-drive artifact directory');
  const save = (path, content) => {
    const target = resolve(root, path);
    assert.ok(target.startsWith(root + sep));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  for (const item of state.writes) save(`generated/${item.path}`, item.content);
  save(`drafts/${section}.md`, columnFixture(section));
  save(`results/${section}.json`, JSON.stringify({ fixture: true, calls: state.calls.length, writes: state.writes.map(item => item.path), result }, null, 2));
}
const columnMaterials = {
  news: [{ type: 'news', title: '离线研究素材', url: 'https://example.org/study', published_date: date, details: { content_html: '预印本。24 只小鼠观察 8 周，尚未经过同行评议，相关不等于因果，没有人体效果证据。' } }],
  project: [{ type: 'project', title: 'demo/aging-notes', url: 'https://example.org/repository', published_date: '2026-10-25', description: '研究笔记索引', details: { totalStars: 2, language: 'JavaScript' } }],
  paper: [], socialMedia: [],
};

for (const [section, handler] of [
  ['opportunity', scheduled.handleScheduledOpportunity],
  ['project-opportunity', scheduled.handleScheduledProjectOpportunity],
]) {
  test(`${section}: fixture passes the complete model-to-records/page path with one generation`, async t => {
    const state = setup(t, [columnFixture(section)]);
    const result = await handler({}, env, {}, date, columnMaterials);
    assert.equal(result.success, true);
    assert.equal(state.calls.length, 1);
    assert.equal(result.records.count, 1);
    assert.equal(state.writes.length, 4);
    assert.match(state.systems[0], /bioai-columns\/2026-10-26.1/);
    assert.match(state.calls[0], /Last activity observed \(not creation or release\): 2026-10-25/);
    assert.doesNotMatch(state.calls[0], /Published: 2026-10-25/);
    assert.match(state.calls[0], /未明确提供的 README/);
    const page = state.writes.find(item => item.path.endsWith(`${date}.md`));
    assert.match(page.content, /\n\n### /);
    const document = JSON.parse(state.writes[0].content);
    assert.equal(document.report_date, date);
    assert.equal(document.report_section, section);
    assert.equal(document.opportunities[0].source_verified, false);
    assert.equal(document.opportunities[0].demand_verified, false);
    assert.equal(result.presentation.status, 'formatted');
    exportColumnFixture(section, state, result);
  });
}

test('daily: fixture is fetched/selected, generated, validated and saved without a polishing call', async t => {
  const state = setup(t, [columnFixture('daily'), '小鼠研究提供了观察线索。\n项目用途是整理研究笔记。\n两者都不能作为人体效果证明。']);
  state.materials = structuredClone(columnMaterials);
  const result = await scheduled.handleScheduledDaily({}, { ...env, DAILY_TITLE: 'AI生命延续学日报', DAILY_DEDUPE_DAYS: '1' }, {}, date);
  assert.equal(result.success, true);
  assert.equal(state.calls.length, 2);
  assert.match(state.systems[0], /bioai-columns\/2026-10-26.1/);
  assert.equal(result.presentation.status, 'formatted');
  assert.equal(result.presentation.version, 'bioai-spacing/2026-10-26.1');
  assert.equal(state.writes.length, 4);
  assert.deepEqual(state.writes.map(item => item.path), [`daily/${date}.md`, `content/cn/2026-10/${date}.md`, 'content/cn/2026-10/_index.md', 'content/cn/_index.md']);
  assert.match(state.writes[0].content, /\n\n### 1\./);
  assert.match(state.writes[0].content, /相关线索，不是延寿的因果证明，也没有人体效果证据/);
  assert.ok(state.writes[1].content.endsWith(state.writes[0].content));
  exportColumnFixture('daily', state, result);
});

test('daily with an unclosed block fails before any publication write', async t => {
  const state = setup(t, [`${columnFixture('daily')}\n\`\`\`js\nconst unfinished = true;`, '小鼠研究提供了观察线索。\n项目用途是整理研究笔记。\n两者都不能作为人体效果证明。']);
  state.materials = structuredClone(columnMaterials);
  const result = await scheduled.handleScheduledDaily({}, { ...env, DAILY_DEDUPE_DAYS: '1' }, {}, date);
  assert.equal(result.success, false);
  assert.deepEqual(state.writes, []);
  assert.match(result.error, /unclosed_fence/);
  assert.ok(state.calls.length <= 2, 'no new daily repair/polishing call');
});

test('structural failure uses the existing bounded correction and cannot publish after two failures', async t => {
  const malformed = `${columnFixture('opportunity')}\n\`\`\`text\n未闭合的代码。`;
  const state = setup(t, [malformed, malformed]);
  const result = await scheduled.handleScheduledOpportunity({}, env, {}, date, columnMaterials);
  assert.equal(result.success, false);
  assert.equal(state.calls.length, 2);
  assert.deepEqual(state.writes, []);
  assert.equal(result.gate_diagnostics[0].format_errors[0].rule, 'unclosed_fence');
  assert.match(state.calls[1], /unclosed_fence/);
});

test('one targeted structural correction publishes only its valid second draft', async t => {
  const good = columnFixture('opportunity');
  const state = setup(t, [`${good}\n\`\`\`text\n未闭合`, good]);
  const result = await scheduled.handleScheduledOpportunity({}, env, {}, date, columnMaterials);
  assert.equal(result.success, true);
  assert.equal(state.calls.length, 2);
  assert.equal(state.writes.length, 4);
  assert.ok(state.writes.every(item => !item.content.includes('未闭合')));
});

test('a light presentation warning never adds another model call', async t => {
  const state = setup(t, [`${columnFixture('opportunity')}\n\n${'研究尚未验证人体效果，不能作为医学建议。'.repeat(22)}`]);
  const result = await scheduled.handleScheduledOpportunity({}, env, {}, date, columnMaterials);
  assert.equal(result.success, true);
  assert.equal(state.calls.length, 1);
  assert.ok(result.presentation.warnings.some(item => item.rule === 'long_paragraph'));
});
