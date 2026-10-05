import test from 'node:test';
import assert from 'node:assert/strict';
import { addReferencedSourceMedia, selectReferencedSourceMedia } from '../src/blogMedia.js';
import { normalizeGeneratedMarkdown } from '../src/blogQuality.js';

const source = 'https://example.org/study';
const image = 'https://cdn.example.org/figure.png';
const daily = `### [研究](${source})\n\n具体研究内容。\n\n[图片: 研究示意图](${image})\n\n### [其他](https://example.org/other)\n\n![其他图](https://cdn.example.org/other.jpg)`;
const body = `这项[研究](${source})需要继续核查。\n\n## 参考资料\n\n- [研究](${source})`;

test('only cited unambiguous source sections supply real image links', () => {
    assert.deepEqual(selectReferencedSourceMedia(daily, body), [{ imageUrl: image, alt: '来源配图：研究示意图', sourceUrl: source, sourceTitle: '研究' }]);
    assert.equal(selectReferencedSourceMedia(daily, '没有引用资料。').length, 0);
    assert.equal(selectReferencedSourceMedia(daily, body, 0).length, 0);
});
test('normal Markdown images are accepted but web pages, ads, fenced examples and ambiguous roundups are not', () => {
    assert.equal(selectReferencedSourceMedia(daily.replace('[图片: 研究示意图]', '![研究示意图]'), body).length, 1);
    assert.equal(selectReferencedSourceMedia(daily.replace(image, source), body).length, 0);
    assert.equal(selectReferencedSourceMedia(`### 汇总\n[研究](${source})\n[其他](https://example.org/other)\n![研究图](${image})`, body).length, 0);
    assert.equal(selectReferencedSourceMedia(`### 研究\n卡密秒发\n[研究](${source})\n![图](${image})`, body).length, 0);
    assert.equal(selectReferencedSourceMedia(`\`\`\`md\n${daily}\n\`\`\``, body).length, 0);
    assert.equal(selectReferencedSourceMedia(`### [研究](${source})\n![图片](${image})`, body).length, 0);
    assert.equal(selectReferencedSourceMedia(`### [研究](${source})\n![脑疾病研究](https://www.news-medical.net/image-handler/picture/2019/server.jpg)`, body).length, 0);
});
test('media enrichment is idempotent, preserves body facts and puts linked images near their actual citation', () => {
    const enriched = addReferencedSourceMedia(body, daily);
    assert.ok(enriched.includes(`[![来源配图：研究示意图](${image})](${source})`));
    assert.ok(enriched.indexOf('![来源配图') < enriched.indexOf('## 参考资料'));
    assert.equal(addReferencedSourceMedia(enriched, daily), enriched);
    assert.equal(normalizeGeneratedMarkdown(enriched, [image, source]), enriched);
    assert.equal(addReferencedSourceMedia(body + `\n\n![已有图](${image})`, daily), body + `\n\n![已有图](${image})`);
});
test('reference-only citations get a source figure before references; multiple sections never exceed two images', () => {
    const references = `正文。\n\n## 参考资料\n- [研究](${source})`;
    const output = addReferencedSourceMedia(references, daily);
    assert.ok(output.indexOf('![来源配图') < output.indexOf('## 参考资料'));
    const many = [1, 2, 3].map(i => `### [研究${i}](${source}${i})\n![图${i}](${image}?v=${i})`).join('\n\n');
    const refs = [1, 2, 3].map(i => `[研究${i}](${source}${i})`).join('\n');
    assert.equal(selectReferencedSourceMedia(many, refs).length, 2);
});
