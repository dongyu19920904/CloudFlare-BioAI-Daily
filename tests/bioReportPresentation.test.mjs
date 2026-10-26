import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatApprovedBioReport, normalizeBioReportSpacing, inspectBioReportMarkdown } from '../src/bioReportPresentation.js';

const fixture = section => readFileSync(new URL(`./fixtures/bio-columns/${section}.md`, import.meta.url), 'utf8');
const noLineBreaks = text => text.replace(/\r?\n/g, '');

for (const section of ['daily', 'opportunity', 'project-opportunity']) {
  test(`${section}: spacing is idempotent and preserves every non-newline character`, () => {
    const input = fixture(section);
    const output = normalizeBioReportSpacing(input);
    assert.notEqual(output, input);
    assert.equal(normalizeBioReportSpacing(output), output);
    assert.equal(noLineBreaks(output), noLineBreaks(input));
    for (const text of ['https://example.org/', '未']) assert.ok(output.includes(text));
    assert.deepEqual(inspectBioReportMarkdown(output, section).errors, []);
  });
}

test('frontmatter, code, inline identifiers, tables and formula blocks are byte-preserved', () => {
  const protectedBlocks = [
    '---\r\ntitle: "固定标题"\r\ndate: 2026-10-26\r\nslug: fixed-slug\r\ncanonical: https://example.org/item\r\n---',
    '```js\r\nconst url = "https://example.org/X?x=1&y=2";  \r\n## not a heading\r\n```',
    '$$\r\n## x = 2 + 3\r\n$$',
    '<pre>\r\n## keep this raw\r\n</pre>',
  ];
  const input = protectedBlocks.join('\r\n') + '\r\n## 正文\r\n`id_v1.2` 的差值是 -0.25，只有相关而非因果。\r\n| 指标 | 值 |\r\n| --- | --- |\r\n| p | 0.05 |\r\n';
  const output = normalizeBioReportSpacing(input);
  for (const block of protectedBlocks) assert.ok(output.includes(block), block);
  assert.equal(noLineBreaks(output), noLineBreaks(input));
  assert.equal(normalizeBioReportSpacing(output), output);
});

test('ordinary horizontal rules are not mistaken for YAML frontmatter', () => {
  assert.deepEqual(inspectBioReportMarkdown('---\n\n## 正文\n有来源的文字。', 'daily').errors, []);
});

test('unclosed code and formula blocks are structural errors, not cosmetic warnings', () => {
  assert.equal(inspectBioReportMarkdown('## 正文\n```js\nconst n=1;', 'daily').errors[0].rule, 'unclosed_fence');
  assert.equal(inspectBioReportMarkdown('## 正文\n$$\nx=1', 'daily').errors[0].rule, 'unclosed_math');
});

test('long prose only produces a bounded warning without changing medical qualifiers', () => {
  const input = '## 正文\n' + '这是一份尚未经过同行评议的小鼠观察材料，相关不等于因果，也没有人体效果证据。'.repeat(12);
  const result = formatApprovedBioReport(input, { section: 'daily', validate() {} });
  assert.ok(result.warnings.some(item => item.rule === 'long_paragraph'));
  assert.equal(noLineBreaks(result.markdown), noLineBreaks(input));
  assert.doesNotMatch(JSON.stringify(result.warnings), /小鼠|https:/);
});

test('a formatter exception or content rewrite falls back to the original approved draft', () => {
  const input = fixture('opportunity');
  for (const formatter of [() => { throw new Error('fixture formatter failure'); }, value => value.replace('24 只', '240 只'), value => value.replace('未提供', '已提供')]) {
    const result = formatApprovedBioReport(input, { section: 'opportunity', validate() {}, formatter });
    assert.equal(result.markdown, input);
    assert.equal(result.status, 'original_approved');
  }
});

test('a formatter cannot alter protected code newlines or frontmatter', () => {
  const input = '---\ntitle: 固定\n---\n## 正文\n```text\na\nb\n```\n';
  const result = formatApprovedBioReport(input, { section: 'daily', validate() {}, formatter: value => value.replace('a\nb', 'ab') });
  assert.equal(result.markdown, input);
  assert.equal(result.status, 'original_approved');
});

test('inserting only a newline still cannot split a source URL or number', () => {
  const input = fixture('daily');
  for (const formatter of [value => value.replace('https://example.org/study', 'https://example.org/\nstudy'), value => value.replace('24 只', '2\n4 只')]) {
    const result = formatApprovedBioReport(input, { section: 'daily', validate() {}, formatter });
    assert.equal(result.markdown, input);
    assert.equal(result.status, 'original_approved');
  }
});

test('many short record fields do not become one long-paragraph warning', () => {
  const input = Array.from({ length: 20 }, (_, index) => `- 字段 ${index}：保留来源和局限，不虚构结果。`).join('\n');
  assert.deepEqual(inspectBioReportMarkdown(input, 'opportunity').warnings, []);
});

test('the original draft must pass validation before formatting can run', () => {
  let calls = 0;
  assert.throws(() => formatApprovedBioReport('未通过来源检查', {
    section: 'opportunity', validate() { throw new Error('missing source'); }, formatter() { calls++; return '合格假象'; },
  }), /missing source/);
  assert.equal(calls, 0);
  assert.throws(() => formatApprovedBioReport('## 正文\n```\n未闭合', { section: 'daily', validate() {} }), /unclosed_fence/);
});

test('post-format validation failure reuses only the previously approved original', () => {
  const input = fixture('project-opportunity');
  let calls = 0;
  const result = formatApprovedBioReport(input, { section: 'project-opportunity', validate() { if (++calls === 2) throw new Error('fixture rejection'); } });
  assert.equal(result.markdown, input);
  assert.equal(result.status, 'original_approved');
});
