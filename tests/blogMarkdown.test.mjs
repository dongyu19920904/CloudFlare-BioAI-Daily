import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeneratedMarkdown, validateBlogDraft } from '../src/blogQuality.js';
import * as writing from '../src/prompt/blogPrompt.js';
import { handleScheduledBlog } from '../src/handlers/scheduledBlog.js';
const { getBlogPrompt, BLOG_WRITING_VERSION } = writing;

test('personal-blog normalization preserves literal Markdown examples and blank lines', () => {
    for (const fence of ['```', '````', '~~~']) {
        const code = `${fence}markdown\n## 目录\n- [example](#example)\n\n\n![sample](https://example.com/not-an-image)\n${fence}`;
        const output = normalizeGeneratedMarkdown(`正文。\n\n${code}\n\n## 参考资料\nhttps://example.com/research`, ['https://example.com/research']);
        assert.ok(output.includes(code), fence);
        assert.ok(output.includes('[来源原文](https://example.com/research)'));
        assert.equal(normalizeGeneratedMarkdown(output, ['https://example.com/research']), output);
    }
});

test('inline code, indented code, formulas and frontmatter are opaque to prose cleanup', () => {
    const metadata = '---\ntitle: "1M token"\nslug: old-slug\ncanonical: https://example.com/a?x=1&y=2\n---';
    const inline = '`![sample](https://example.com/example)`';
    const indented = '    ## 目录\n    ![sample](https://example.com/example)';
    const math = '$$\nx = 10\n\n\ny = 20\n$$';
    const input = `${metadata}\n\n正文 61 万人、5% 到 9%。${inline}\n\n${indented}\n\n${math}`;
    const output = normalizeGeneratedMarkdown(input);
    for (const literal of [metadata, inline, indented, math, '61 万人、5% 到 9%']) assert.ok(output.includes(literal), literal);
    assert.equal(normalizeGeneratedMarkdown(output), output);
});

test('unclosed fences are left intact and token-like source text cannot collide', () => {
    const input = '\uE000BLOG_LITERAL_0\uE001\n\n```md\n## 目录\n\n\n![sample](https://example.com/page)';
    assert.equal(normalizeGeneratedMarkdown(input), input);
    const quoted = '> ```markdown\n> ## 目录\n> ![sample](https://example.com/page)\n> ```';
    assert.equal(normalizeGeneratedMarkdown(quoted), quoted);
    const result = validateBlogDraft({title:'读懂一个具体的小问题',body:input,dailyContent:'Claude 的说明。'.repeat(30),blogType:'ai-daily'});
    assert.ok(result.severe.includes('unclosed_code_fence'), 'do not publish a half-open code block');
});

test('normal prose keeps existing image and table-of-contents safeguards', () => {
    const result = normalizeGeneratedMarkdown('## 目录\n- [one](#one)\n\n正文。\n\n![bad](https://untrusted.example/p.png)\n\n![page](https://example.com/page)', ['https://example.com/page']);
    assert.doesNotMatch(result, /## 目录|untrusted/);
    assert.ok(result.includes('[page](https://example.com/page)'));
});

test('versioned writing rules reach both real prompt variants without a new review stage', () => {
    assert.equal(BLOG_WRITING_VERSION, '2026-10-26.1');
    for (const kind of ['ai-daily', 'bioai-daily']) {
        const prompt = getBlogPrompt(kind, '2026-10-26', []);
        assert.ok(prompt.includes(BLOG_WRITING_VERSION));
        assert.match(prompt, /按读者的问题组织/);
        assert.match(prompt, /不能将 token 固定换算/);
        assert.match(prompt, /代码块/);
        assert.doesNotMatch(prompt, /通常零到一个正文小标题/);
    }
});

for (const blogType of ['ai-daily', 'bioai-daily']) {
    for (const fail of [false, true]) {
        test(`${blogType} actual preview chain ${fail ? 'stops after one failed repair' : 'uses the versioned prompt once despite a mild warning'}`, async t => {
            let modelCalls = 0;
            const paragraph = '我更在意一个结论能回答什么问题。先找到原文中的对象和条件，再看这条材料能够支持哪一步判断。读者拿到解释以后，可以回去核对，而不用凭一句介绍就相信它。';
            const warning = '这是一段用于检查轻度长句警告的测试说明'.repeat(5) + '。';
            const good = '读懂结果之前先核对它从哪里来\n\n' + Array(6).fill(paragraph).join('\n\n') + '\n\n' + warning + '\n\n## 参考资料\n\n- [原文](https://example.com/research)';
            t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
                const address = String(url);
                if (address.startsWith('https://raw.githubusercontent.com/')) return new Response('# Claude 与衰老研究的模拟材料\n\n' + paragraph.repeat(8) + '\nhttps://example.com/research');
                assert.equal(address, 'https://model.invalid/v1/messages', 'only the mocked model may be called; no publication request');
                const payload = JSON.parse(options.body);
                assert.ok(payload.system.includes(BLOG_WRITING_VERSION), 'version reaches the actual API payload');
                modelCalls++;
                const text = fail ? '我是 Claude Code，Anthropic 官方命令行工具。' : good;
                return new Response(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\ndata: {"type":"message_stop"}\n\n`);
            });
            const env = { USE_MODEL_PLATFORM: 'ANTHROPIC', ANTHROPIC_API_BASE_URL: 'https://model.invalid', ANTHROPIC_API_KEY: 'placeholder', DEFAULT_ANTHROPIC_MODEL: 'fixture', GITHUB_REPO_OWNER: 'owner', DATA_KV: { put() { assert.fail('preview must not write status'); } } };
            const result = await handleScheduledBlog({}, env, {}, '2026-10-25', { dryRun: true, previewType: blogType });
            assert.equal(result.results.length, 1);
            assert.equal(modelCalls, fail ? 2 : 1);
            assert.equal(result.success, !fail);
            if (!fail) {
                assert.ok(result.results[0].warnings.length > 0);
                assert.ok(result.results[0].content.includes('https://example.com/research'));
                assert.ok(result.results[0].content.includes('pubDatetime: 2026-10-25T01:00:00.000Z'));
            }
        });
    }
}
