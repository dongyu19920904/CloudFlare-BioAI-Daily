import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessBlogReadability } from '../src/blogReadability.js';
import { getBlogPrompt } from '../src/prompt/blogPrompt.js';
import { validateBlogDraft } from '../src/blogQuality.js';
import { classifyLongSentences } from '../src/blogQuality.js';

test('separate paragraphs do not merge into a false severe sentence', () => {
    const result = classifyLongSentences(('一段没有句末标点但不长的说明'.repeat(5) + '\n\n').repeat(4));
    assert.equal(result.severe.length, 0);
    assert.equal(classifyLongSentences('这'.repeat(180)).severe.length, 1);
});

test('isolated technical words and ordinary explanations never require a repair', () => {
    assert.deepEqual(assessBlogReadability('MRI 就是磁共振成像，用来观察身体内部。你可以先了解这张图拍到了什么。').severe, []);
    assert.deepEqual(assessBlogReadability('SQL、AST 和 LoRA 是文章会涉及的几个名词。').severe, []);
    assert.ok(assessBlogReadability('SQL、AST 和 LoRA 是文章会涉及的几个名词。').warnings.length);
});

test('only a dense unexplained jargon wall enters the existing severe repair', () => {
    assert.deepEqual(assessBlogReadability('AST、SQL、向量检索、嵌入和微调共同实现迁移学习。').severe, ['jargon_wall']);
    assert.deepEqual(assessBlogReadability('AST 就是先找出代码里有哪些部分。SQL 用来描述数据库的读写。LoRA 可以理解为只调整模型的一小部分。').severe, []);
});

test('references, links, fenced code and URLs do not create jargon failures', () => {
    const draft = '这篇只讲清一个问题。\n\n```text\nAST SQL CASP GMR LoRA MRI NfL\n```\n\n## 参考资料\n\n- [AST SQL CASP GMR LoRA MRI NfL](https://example.com/AST/SQL)';
    assert.deepEqual(assessBlogReadability(draft), { severe: [], warnings: [] });
    assert.deepEqual(assessBlogReadability('![AST SQL CASP GMR LoRA MRI](https://example.com/figure.png)'), { severe: [], warnings: [] });
});

test('report phrasing is a warning, not a new model call', () => {
    const result = assessBlogReadability('我的判断是先了解用途。值得注意的是输入不同。综上所述需要再看原文。');
    assert.deepEqual(result.severe, []);
    assert.ok(result.warnings.some(item => item.startsWith('report_style:')));
});

test('both prompts teach beginners without inventing a life story or compulsory identity paragraphs', () => {
    for (const type of ['ai-daily', 'bioai-daily']) {
        const prompt = getBlogPrompt(type);
        assert.match(prompt, /高中未毕业，跑过外卖/);
        assert.match(prompt, /不是每篇必须复述/);
        assert.match(prompt, /一篇只处理一个问题/);
        assert.match(prompt, /术语第一次出现就用一句日常话解释/);
        assert.match(prompt, /不能靠插入收入/);
    }
    for (const file of ['scheduled.js', 'scheduledOpportunity.js', 'scheduledProjectOpportunity.js']) {
        const url = new URL('../src/handlers/' + file, import.meta.url);
        let text;
        try { text = readFileSync(url, 'utf8'); } catch { continue; }
        assert.doesNotMatch(text, /blogReadability|assessBlogReadability/);
    }
});

test('plain language never licenses unsupported accuracy or field-wide clinical claims', () => {
    const base = { title:'读懂工具需要先核对真实结果', dailyContent:'Claude 和脑年龄研究公开数据。'.repeat(25), allowedUrls:[] };
    const ai = validateBlogDraft({...base, blogType:'ai-daily', body:'AI 拿到查询结果，准确率会比直接拿源文件高很多。'.repeat(10)});
    assert.ok(ai.severe.includes('unsupported_tool_effectiveness_claim'));
    const bio = validateBlogDraft({...base, blogType:'bioai-daily', body:'目前没有一个统一的临床标准。'.repeat(25)});
    assert.ok(bio.severe.includes('unsupported_bio_generalization'));
});
