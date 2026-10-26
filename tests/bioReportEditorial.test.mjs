import test from 'node:test';
import assert from 'node:assert/strict';
import { BIO_REPORT_EDITORIAL_VERSION, getBioReportEditorialContract } from '../src/prompt/bioReportEditorial.js';
import { getSystemPromptSummarizationStepOne } from '../src/prompt/summarizationPromptStepZero.js';
import { getSystemPromptBioOpportunity } from '../src/prompt/bioOpportunityPrompt.js';
import { getSystemPromptBioProjectOpportunity } from '../src/prompt/bioProjectOpportunityPrompt.js';

test('the versioned column rules are included in actual system prompts', () => {
  for (const [section, build] of [
    ['daily', getSystemPromptSummarizationStepOne],
    ['opportunity', getSystemPromptBioOpportunity],
    ['project-opportunity', getSystemPromptBioProjectOpportunity],
  ]) {
    const prompt = build('2026-10-26');
    assert.ok(prompt.includes(BIO_REPORT_EDITORIAL_VERSION));
    assert.ok(prompt.includes(getBioReportEditorialContract(section)));
    assert.match(prompt, /预印本|同行评议/);
    assert.match(prompt, /相关.*因果/);
  }
});

test('column rules distinguish research facts, buyer hypotheses and project execution', () => {
  assert.match(getBioReportEditorialContract('daily'), /概念.*证据/);
  assert.match(getBioReportEditorialContract('opportunity'), /需求证据/);
  assert.match(getBioReportEditorialContract('opportunity'), /点赞.*付费/);
  assert.match(getBioReportEditorialContract('project-opportunity'), /最近活跃.*发布/);
  assert.match(getBioReportEditorialContract('project-opportunity'), /待核查/);
  assert.throws(() => getBioReportEditorialContract('blog'), /Unsupported/);
});

test('shared editing rules protect qualifiers and do not create personal experience or clinical promises', () => {
  for (const section of ['daily', 'opportunity', 'project-opportunity']) {
    const prompt = getBioReportEditorialContract(section);
    for (const term of ['否定', '归因', '细胞', '动物', '人体', '诊断', '用药', '寿命', '个人经历']) assert.ok(prompt.includes(term), term);
  }
});
