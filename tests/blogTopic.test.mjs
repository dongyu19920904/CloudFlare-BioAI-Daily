import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBlogWritingMaterial } from '../src/blogTopic.js';
import { qualifyDailyForPersonalBlog } from '../src/blogQuality.js';

test('AI writing prefers an actionable tool over opening MAU commentary', () => {
    const metric = '### 办公 Agent 的 MAU\n\n' + '月活讨论和市场变化。'.repeat(25) + '\n[原帖](https://example.com/mau)';
    const tool = '### Graphify 为 AI 编程助手找相关代码\n\n' + '这个开源工具读取代码库中的关系，帮助查看一个文件关联到哪里。'.repeat(9) + '\n[仓库](https://github.com/example/tool)';
    const selected = selectBlogWritingMaterial(metric + '\n\n' + tool, 'ai-daily');
    assert.equal(selected, tool);
    assert.equal(qualifyDailyForPersonalBlog(selected, 'ai-daily').eligible, true);
});

test('BioAI chooses one relevant explanation instead of combining brain scans and a drug trial', () => {
    const drug = '### 某药物二期试验的结果\n\n' + '研究给出疾病试验结果。'.repeat(30) + '\n[报道](https://example.com/drug)';
    const tool = '### Brain2Vec 脑年龄预测工具\n\n' + 'AI 研究使用扫描数据来预测脑年龄，公开了研究工具。'.repeat(12) + '\n[论文](https://example.com/brain)';
    const selected = selectBlogWritingMaterial(drug + '\n\n' + tool, 'bioai-daily');
    assert.equal(selected, tool);
    assert.ok(!selected.includes('example.com/drug'));
});

test('thin or unstructured input remains subject to the existing source gate', () => {
    assert.equal(selectBlogWritingMaterial('短材料', 'ai-daily'), '短材料');
    assert.equal(selectBlogWritingMaterial('## Cursor\n没有来源。'.repeat(10), 'ai-daily'), '## Cursor\n没有来源。'.repeat(10));
});

test('topic narrowing never hides an upstream model refusal from qualification', () => {
    const text = '我是 Claude Code，Anthropic 官方命令行工具。\n\n### Graphify AI 编程工具\n\n' + '这里有一段看起来足够长的材料。'.repeat(20) + '\n[来源](https://example.com/source)';
    const selected = selectBlogWritingMaterial(text, 'ai-daily');
    assert.equal(selected, text);
    assert.equal(qualifyDailyForPersonalBlog(selected, 'ai-daily').eligible, false);
});
