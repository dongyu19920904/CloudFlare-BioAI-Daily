import test from "node:test";
import assert from "node:assert/strict";

import { getSystemPromptSummarizationStepOne } from "../src/prompt/summarizationPromptStepZero.js";
import { getBioDailyReadabilityReminder } from "../src/prompt/summarizationPromptStepZero.js";
import { getSystemPromptSummarizationStepThree, getSystemPromptDailyPlainEditing, getBioDailyEditingReminder } from "../src/prompt/summarizationPromptStepThree.js";
import { readFileSync } from 'node:fs';
import { callChatAPI } from '../src/chatapi.js';

test("daily prompt keeps the report evidence-first and separate from opportunity columns", () => {
  const prompt = getSystemPromptSummarizationStepOne("2026-09-20");

  assert.match(prompt, /先讲证据，再讲意义/);
  assert.match(prompt, /发生了什么、证据来自哪里、目前到哪一步/);
  assert.match(prompt, /不展开“谁会付费、怎么卖、怎么做产品”/);
  assert.match(prompt, /signal_score.*不代表临床有效性/s);
  assert.match(prompt, /不输出“来源类型 \/ 证据阶段 \/ 可信度”标签行/);
  assert.match(prompt, /不另写粗体短结论/);
  assert.match(prompt, /来源链接融入事实句/);
  assert.match(prompt, /研究类型和最重要的局限融入正文/);
  assert.match(prompt, /不输出一级标题/);
  assert.doesNotMatch(prompt, /太离谱了|笑死|跑分直接碾压/);
});

test('daily writing teaches core concepts without hiding scientific limits', () => {
  const prompt = getSystemPromptSummarizationStepOne('2026-10-17');
  assert.match(prompt, /没有医学背景/);
  assert.match(prompt, /保留核心概念，而不是删光术语/);
  assert.match(prompt, /首次出现时就近用白话解释/);
  assert.match(prompt, /一项有信息量的发现或方法细节/);
  assert.match(prompt, /样本量、观察时长和关键结果/);
  assert.match(prompt, /不设最多两组的硬上限/);
  assert.match(prompt, /150-230/);
  assert.match(prompt, /让读者知道点开能继续学什么/);
  assert.match(prompt, /不能捏造 URL、搜索地址/);
  assert.match(prompt, /不能把指标下降说成患病风险下降或延寿比例/);
  assert.match(prompt, /目前只在小鼠中看到效果，还不能说明对人也有效/);
  assert.match(prompt, /不额外加粗术语、数字或整句/);
  assert.match(prompt, /不机械截断|不为满足字数机械截断/);
});

test('both generation and editing retain learning detail rather than enforce tiny caps', () => {
  const prompts = [getSystemPromptSummarizationStepOne(), getSystemPromptDailyPlainEditing(), getBioDailyReadabilityReminder()];
  for (const prompt of prompts) {
    assert.match(prompt, /核心概念/);
    assert.match(prompt, /解释|说明/);
    assert.match(prompt, /发现或方法细节/);
    assert.match(prompt, /锚文本/);
    assert.doesNotMatch(prompt, /每条最多两组数字|数字通常一组、最多两组|90-150 个汉字|专有名称通常最多 1-2/);
  }
});

test('daily summary is plain Chinese, not a second technical abstract', () => {
  const prompt = getSystemPromptSummarizationStepThree();
  assert.match(prompt, /三行合计最多一组数字/);
  assert.match(prompt, /不列陌生基因名、蛋白名、药物编号、英文缩写/);
  assert.match(prompt, /小鼠研究/);
  assert.match(prompt, /只使用正文已有的事实/);
});

test('scheduled and manual daily paths repeat the same brief after source material', () => {
  assert.match(getBioDailyReadabilityReminder(), /最后一句保留科学限制/);
  for (const file of ['scheduled.js', 'genAIContent.js']) {
    const source = readFileSync(new URL(`../src/handlers/${file}`, import.meta.url), 'utf8');
    assert.match(source, /let fullPromptForCall2_User =[^\n]+\+ getBioDailyReadabilityReminder\(\)/);
    assert.match(source, /let fullPromptForCall3_System = getSystemPromptDailyPlainEditing\(\)/);
    assert.match(source, /parseBioDailyPlainEditingResult\(outputOfCall3, outputOfCall2, editInput\.references\)/);
    assert.match(source, /prepareBioDailyPlainEditingInput\(outputOfCall2, selectedContentItems\)/);
    assert.match(source, /editInput.prompt \+ getBioDailyEditingReminder\(\)/);
    assert.doesNotMatch(source, /outputOfCall3 = removeMarkdownCodeBlock\(outputOfCall3\)/);
  }
});

test('final edit cross-checks thin evidence and cannot invent project upload workflows', () => {
  const prompt=getSystemPromptDailyPlainEditing();
  assert.match(prompt,/原始来源.*优先于草稿/);
  assert.match(prompt,/数据上传、脑区可视化、无需安装/);
  assert.match(prompt,/阴性结果仍用白话保留/);
  assert.match(getBioDailyEditingReminder(),/每行目标30字、不超过44字/);
  assert.match(getBioDailyEditingReminder(),/相关性不能写成能准确测量/);
  assert.match(prompt,/必须合并为一条.*全部来源链接/);
  assert.doesNotMatch(prompt,/不合并新闻|保持原栏目顺序、新闻数量/);
});

test('the existing summary call also edits the full daily without adding a third call', () => {
  const prompt = getSystemPromptDailyPlainEditing();
  assert.match(prompt, /整篇改成普通 AI 日报那样好读/);
  assert.match(prompt, /三行合计最多一组数字/);
  assert.match(prompt, /不能把几千人写成万人/);
  assert.match(prompt, /来源链接逐字复制/);
  assert.match(prompt, /具体干预|干预方式|实验方式/);
});

test('non-stream daily fallback preserves the native Anthropic instruction boundary', async t => {
  const payloads=[];
  t.mock.method(globalThis,'fetch',async (_url,options)=>{
    payloads.push(JSON.parse(options.body));
    return new Response(JSON.stringify({content:[{type:'text',text:'ok'}],stop_reason:'end_turn'}));
  });
  const env={USE_MODEL_PLATFORM:'ANTHROPIC',ANTHROPIC_API_BASE_URL:'https://example.invalid',ANTHROPIC_API_KEY:'test-only-placeholder',DEFAULT_ANTHROPIC_MODEL:'test-model'};
  await callChatAPI(env,'news-data','editorial-rules');
  await callChatAPI({...env,ANTHROPIC_NATIVE_SYSTEM_PROMPT:true},'news-data','editorial-rules');
  assert.equal(payloads[0].system,undefined);
  assert.equal(payloads[0].messages[0].content,'editorial-rules\n\nnews-data');
  assert.equal(payloads[1].system,'editorial-rules');
  assert.equal(payloads[1].messages[0].content,'news-data');
});

test('failed dry-runs retain private diagnostics without printing the response body', () => {
  const workflow = readFileSync(new URL('../.github/workflows/manual-trigger-worker.yml', import.meta.url), 'utf8');
  assert.match(workflow, /if: always\(\) && inputs\.dry_run/);
  assert.match(workflow, /retention-days: 7/);
});
