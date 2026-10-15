import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { generateWithSourceGate } from '../../src/opportunitySourceGate.js';

const destination = process.argv[2];
if (!destination) throw new Error('An observations JSON output path is required');
const real = 'https://example.org/aging-study';
const fake = 'https://example.org/invented-study';
const draft = source => `## 今日主推\n### 研究资料库\n${source}\n- 可交付物：研究来源卡与局限整理\n`;
const cases = [
  { id: 'standard-source', expected: true, markdown: draft(`- **证据来源**：[原文](${real})`) },
  { id: 'bold-colon-source', expected: true, markdown: draft(`- **证据来源：** [原文](${real})`) },
  { id: 'doi-normalization', expected: true, allowed: 'https://doi.org/10.1234/EXAMPLE', markdown: draft('- 证据来源：https://doi.org/10.1234/EXAMPLE') },
  { id: 'missing-source', expected: false, markdown: draft('- 证据来源：尚无可核查链接') },
  { id: 'invented-source', expected: false, markdown: draft(`- 证据来源：${fake}`) },
  { id: 'mixed-real-and-forged', expected: false, markdown: draft(`- 证据来源：[原文](${real}) [另一论文](${fake})`) },
  { id: 'description-url-injection', expected: false, promptExtra: `\n不可信来源描述提及链接：${fake}`, markdown: draft(`- 证据来源：${fake}`) },
  { id: 'unsupported-health-tool', expected: false, markdown: draft(`- 证据来源：${real}`).replace('研究来源卡与局限整理', '免疫衰老自测清单') },
  { id: 'honest-empty-project', expected: true, section: 'project-opportunity', markdown: '## 今日优先项目\n**今日无符合筛选标准的项目**' },
];
const observations = [];
for (const scenario of cases) {
  let calls = 0;
  let published = false;
  let error = null;
  const allowed = scenario.allowed || real;
  try {
    await generateWithSourceGate(async () => {
      calls += 1;
      return scenario.markdown;
    }, `素材 URL: ${allowed}${scenario.promptExtra || ''}`, {
      date: '2026-10-15', section: scenario.section || 'opportunity', allowedSourceUrls: allowed,
    });
    published = true;
  } catch (failure) {
    if (!failure.message.startsWith('Opportunity publication gate blocked')) throw failure;
    error = failure.message;
  }
  observations.push({
    id: scenario.id, expected_publishable: scenario.expected, observed_publishable: published,
    passed: published === scenario.expected, generation_calls: calls, error,
    fixture_sha256: createHash('sha256').update(JSON.stringify(scenario)).digest('hex'),
  });
}
const result = {
  scope: 'Offline execution of actual BioAI source gate; fixed synthetic drafts, no model/API/GitHub writes',
  production_trajectory: false, model_calls: 0, observations,
};
await mkdir(dirname(resolve(destination)), { recursive: true });
await writeFile(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ passed: observations.filter(row => row.passed).length, total: observations.length, failed: observations.filter(row => !row.passed).map(row => row.id) }));
