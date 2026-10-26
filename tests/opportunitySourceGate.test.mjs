import test from "node:test";
import assert from "node:assert/strict";
import { assessOpportunitySourceGate, generateWithSourceGate } from "../src/opportunitySourceGate.js";

const options = { date: "2026-09-26", section: "opportunity" };
const missing = "## 今日主推\n### 肌酸选题\n- **证据来源**：某篇研究的报道（研究编号未提供）\n";
const sourced = "## 今日主推\n### 肌酸选题\n- **证据来源**：[原报道](https://example.org/research/creatine)\n";

test("a real report without a clickable source cannot publish", () => {
  const gate = assessOpportunitySourceGate(missing, options);
  assert.equal(gate.publishable, false);
  assert.deepEqual(gate.missing, ["肌酸选题"]);
});

test("a bounded second attempt can supply only real source URLs", async () => {
  let calls = 0;
  const result = await generateWithSourceGate(async (prompt) => {
    calls += 1;
    if (calls === 2) assert.match(prompt, /不要猜测、补造 DOI/);
    return calls === 1 ? missing : sourced;
  }, "素材 URL: https://example.org/research/creatine", options);
  assert.equal(calls, 2);
  assert.equal(result, sourced);
});

test("two failed attempts stop before any sidecar or page write", async () => {
  let calls = 0;
  await assert.rejects(generateWithSourceGate(async () => { calls += 1; return missing; }, "素材", options), /Opportunity publication gate blocked/);
  assert.equal(calls, 2);
});

test("an honest no-project day is publishable without inventing a repository", () => {
  const gate = assessOpportunitySourceGate("## 今日优先项目\n**今日无符合筛选标准的项目**", { ...options, section: "project-opportunity" });
  assert.equal(gate.publishable, true);
});

test("no-project day does not bypass the health self-assessment gate", () => {
  const gate = assessOpportunitySourceGate("## 今日优先项目\n**今日无符合筛选标准的项目**\n## 小机会\n免疫衰老自测清单", { ...options, section: "project-opportunity" });
  assert.equal(gate.publishable, false);
  assert.equal(gate.unsafe_health_self_assessment, true);
});

test("unsafe suggestions on an empty project day are discarded without another paid call", async () => {
  let calls = 0;
  const result = await generateWithSourceGate(async () => {
    calls += 1;
    return "## 今日优先项目\n**今日无符合筛选标准的项目**\n## 小机会\n免疫衰老自测清单";
  }, "素材 URL: https://example.org/mouse-study", { ...options, section: "project-opportunity" });
  assert.equal(calls, 1);
  assert.match(result, /原草稿已丢弃/);
  assert.doesNotMatch(result, /免疫衰老自测清单/);
  assert.equal(assessOpportunitySourceGate(result, { ...options, section: "project-opportunity" }).publishable, true);
});

test("a risky named project is still blocked, not converted into an empty report", async () => {
  let calls = 0;
  await assert.rejects(generateWithSourceGate(async () => {
    calls += 1;
    return "## 今日优先项目\n### 风险项目\n- 证据来源：https://example.org/mouse-study\n- 可交付物：免疫衰老自测清单";
  }, "素材 URL: https://example.org/mouse-study", { ...options, section: "project-opportunity" }), /Opportunity publication gate blocked/);
  assert.equal(calls, 2);
});

test("model-invented source links are rejected even when well formed", () => {
  const gate = assessOpportunitySourceGate(sourced, { ...options, allowedSourceUrls: "素材 URL: https://example.org/other" });
  assert.equal(gate.publishable, false);
});

test("animal-study opportunity cannot turn into a consumer self-test even with a source URL", () => {
  const markdown = "## 今日主推\n### 免疫衰老研究追踪\n- **证据来源**：小鼠实验 https://example.org/mouse-study\n- **可交付物**：免疫衰老自测清单\n";
  const gate = assessOpportunitySourceGate(markdown, { ...options, allowedSourceUrls: "素材 URL: https://example.org/mouse-study" });
  assert.deepEqual(gate.missing, []);
  assert.equal(gate.unsafe_health_self_assessment, true);
  assert.equal(gate.publishable, false);
});

test("bounded retry may replace an unsupported self-test with research tracking", async () => {
  let calls = 0;
  const result = await generateWithSourceGate(async (prompt) => {
    calls += 1;
    if (calls === 2) assert.match(prompt, /动物实验当作人体检测方法/);
    return `## 今日主推\n### 免疫衰老研究追踪\n- **证据来源**：小鼠实验 https://example.org/mouse-study\n- **可交付物**：${calls === 1 ? "免疫衰老自测清单" : "研究来源卡与局限整理"}\n`;
  }, "素材 URL: https://example.org/mouse-study", options);
  assert.equal(calls, 2);
  assert.match(result, /研究来源卡/);
});

test("software installation checks do not inherit health risk from research elsewhere", () => {
  const markdown = `${sourced.replace('肌酸选题', '衰老研究资料工具安装')}\n- 可交付物：工具安装自测与软件自检，检查依赖和接口响应。\n## 研究边界\n只整理健康研究来源与证据局限。`;
  const gate = assessOpportunitySourceGate(markdown, options);
  assert.equal(gate.publishable, true);
  assert.equal(gate.unsafe_health_self_assessment, false);
});

test("a self-test word alone cannot turn software into a health product", () => {
  assert.equal(assessOpportunitySourceGate(`${sourced}\n- 可交付物：软件安装自测。`, options).publishable, true);
});

test("unsafe advice outside the main promotion remains blocked with a location", () => {
  const gate = assessOpportunitySourceGate(`${sourced}\n## 可测试小机会\n今天制作个人健康风险评分表。`, options);
  assert.equal(gate.publishable, false);
  assert.equal(gate.health_hits[0].section, '可测试小机会');
  assert.match(gate.health_hits[0].snippet, /个人健康风险评分/);
  assert.ok(gate.health_hits[0].line > 0);
});

test("health context can come from the item heading or adjacent fields, not only the sentence", () => {
  for (const body of [
    '## 今日主推\n### 免疫衰老研究\n- 证据来源：https://example.org/research/creatine\n- 可交付物：面向个人的自评清单。',
    `${sourced}\n## 小机会\n目标用户：关注免疫衰老的普通人\n可交付物：个人自测表。`,
  ]) assert.equal(assessOpportunitySourceGate(body, options).publishable, false);
});

test("discouragement stays fail-closed and negation does not create a bypass", () => {
  for (const advice of ['不要制作健康自测清单。', '不建议直接诊断，但可以先销售免疫自测表。', '工具安装自测后，生成个人疾病风险评分。']) {
    assert.equal(assessOpportunitySourceGate(`${sourced}\n## 今天别碰\n${advice}`, options).publishable, false);
  }
});

test("software checks under a health topic are distinct from personal diagnostic checks", () => {
  assert.equal(assessOpportunitySourceGate(`${sourced}\n## 健康研究工具\n软件安装自检：确认 Python 依赖齐全。`, options).publishable, true);
  assert.equal(assessOpportunitySourceGate(`${sourced}\n## 健康研究工具\n个人自检：根据症状判断疾病风险。`, options).publishable, false);
});

test("DOI case, resolver aliases, encoding and tracking use the same source canonicalization", () => {
  const markdown = sourced.replace('https://example.org/research/creatine', 'https://doi.org/10.1002/alz.71772');
  for (const allowedSourceUrls of ['https://doi.org/10.1002/ALZ.71772', 'https://dx.doi.org/10.1002/ALZ.71772?utm_source=test#section', 'https://doi.org/10.1002%2FALZ.71772']) {
    assert.equal(assessOpportunitySourceGate(markdown, { ...options, allowedSourceUrls }).publishable, true);
  }
});

test("one real link does not launder an additional invented source", () => {
  const markdown = `${sourced.trim()} 和 https://example.org/fabricated\n`;
  assert.equal(assessOpportunitySourceGate(markdown, { ...options, allowedSourceUrls: 'https://example.org/research/creatine' }).publishable, false);
  assert.equal(assessOpportunitySourceGate(sourced.replace('/research/creatine', '/Research/creatine'), { ...options, allowedSourceUrls: 'https://example.org/research/creatine' }).publishable, false);
});

test("retry receives the failed draft and exact health location while diagnostics are bounded and redacted", async () => {
  const draft = `${sourced}\n## 今天别碰\n不要制作健康自测清单；联系 private@example.org，key=fixture-secret sk-fixture_012345678901234567890123456789。`;
  const diagnostics = [];
  let calls = 0;
  const result = await generateWithSourceGate(async prompt => {
    calls++;
    if (calls === 2) {
      assert.match(prompt, /失败草稿/);
      assert.match(prompt, /今天别碰/);
      assert.match(prompt, /不要制作健康自测清单/);
      assert.match(prompt, /https:\/\/example.org\/research\/creatine/);
    }
    return calls === 1 ? draft : sourced;
  }, '素材 URL: https://example.org/research/creatine', { ...options, onDiagnostic: value => diagnostics.push(value) });
  assert.equal(result, sourced);
  assert.deepEqual(diagnostics.map(value => value.attempt), [1, 2]);
  assert.equal(diagnostics[0].extracted_count, 1);
  assert.equal(diagnostics[0].health_hits[0].section, '今天别碰');
  const log = JSON.stringify(diagnostics);
  assert.doesNotMatch(log, /private@example|fixture-secret|sk-fixture|https:\/\/example.org/);
  assert.ok(log.length < 3000);
});

test("two failures retain only sanitized diagnostics, not a draft or source prompt", async () => {
  let calls = 0;
  await assert.rejects(generateWithSourceGate(async () => { calls++; return missing; }, '素材', { ...options, onDiagnostic() {} }), error => {
    assert.equal(error.gateDiagnostics.length, 2);
    assert.deepEqual(error.gateDiagnostics[1].missing_source_items, [{ title: '肌酸选题', reason: 'missing_source' }]);
    assert.equal(error.gateDiagnostics[1].extracted_count, 1);
    assert.equal('markdown' in error, false);
    return true;
  });
  assert.equal(calls, 2);
});

test("opportunity with no main item remains a failure, not an empty success", () => {
  const gate = assessOpportunitySourceGate('## 今日主推\n今日未筛出合格主推。', options);
  assert.equal(gate.publishable, false);
  assert.equal(gate.extraction_status, 'no_main_items');
});

test('personal diagnostic products cannot bypass review merely by omitting self-test words', () => {
  for (const advice of ['- 可交付物：根据个人症状出具诊断报告。', '今天开发个人疾病风险评分问卷。']) {
    assert.equal(assessOpportunitySourceGate(`${sourced}\n## 今日动作\n${advice}`, options).publishable, false);
  }
});

test('personal nontechnical assessment remains conservative even across paragraph boundaries', () => {
  assert.equal(assessOpportunitySourceGate(`${sourced}\n## 今日动作\n整理健康研究来源。\n\n制作面向个人的自测清单。`, options).publishable, false);
});

test('retry draft URLs never enter the immutable input whitelist', async () => {
  const forged = sourced.replace('/research/creatine', '/fabricated');
  await assert.rejects(generateWithSourceGate(async () => forged, '素材: https://example.org/research/creatine', { ...options, onDiagnostic() {} }), error => {
    assert.equal(error.gateDiagnostics[1].missing_source_items[0].reason, 'source_not_in_input');
    return true;
  });
});

test('explicit system diagnostics stay technical without exempting personal diagnoses', () => {
  assert.equal(assessOpportunitySourceGate(`${sourced}\n## 健康研究工具\n可交付物：系统故障诊断工具，检查接口和依赖。`, options).publishable, true);
  for (const advice of [
    '可交付物：系统故障诊断工具，同时提供个人诊断报告。',
    '开发软件诊断工具，向用户提供疾病风险评分。',
  ]) assert.equal(assessOpportunitySourceGate(`${sourced}\n## 今日动作\n${advice}`, options).publishable, false);
});

test('diagnostics cap repeated hits and redact contact details inside the matched sentence', async () => {
  const lines = Array.from({ length: 8 }, () => '制作健康自测清单，联系 private@example.org，key=fixture-secret，电话 13800138000。');
  const draft = `${sourced}\n## 今天别碰\n${lines.join('\n')}`;
  await assert.rejects(generateWithSourceGate(async () => draft, '素材 https://example.org/research/creatine', { ...options, onDiagnostic() {} }), error => {
    const diagnostic = error.gateDiagnostics[0];
    assert.equal(diagnostic.health_hit_count, 8);
    assert.equal(diagnostic.health_hits.length, 5);
    assert.ok(diagnostic.health_hits.every(hit => hit.snippet.length <= 160));
    assert.doesNotMatch(JSON.stringify(diagnostic), /private@example|fixture-secret|13800138000/);
    return true;
  });
});

test('biological functions and health tools are not software-check objects', () => {
  for (const advice of [
    '可交付物：免疫功能自测清单。',
    '今天制作个人健康工具自测表。',
    '开发身体性能自检工具。',
  ]) assert.equal(assessOpportunitySourceGate(`${sourced}\n## 健康研究\n${advice}`, options).publishable, false);
});
