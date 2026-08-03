import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDailyContentWithFrontMatter,
  updateHomeIndexContent,
} from '../src/contentUtils.js';

test('daily front matter exposes real editorial and YMYL metadata', () => {
  const page = buildDailyContentWithFrontMatter('2026-08-03', '## 今日结论\n\n- 示例', {
    title: 'AI生命延续学日报 2026年8月3日',
  });

  assert.match(page, /^date: 2026-08-03T00:00:00\+08:00$/m);
  assert.match(page, /^lastmod: 2026-08-03T00:00:00\+08:00$/m);
  assert.match(page, /^author: "AI 生命延续学编辑部"$/m);
  assert.match(page, /^editor: "AI 生命延续学编辑部"$/m);
  assert.match(page, /^description: ".*证据强弱.*"$/m);
});

test('new daily homepage stays stable and delegates the latest issue to the shortcode', () => {
  const home = updateHomeIndexContent('', 'unused daily body', '2026-08-03', {
    title: 'AI 生命延续学日报',
  });

  assert.match(home, /^layout: home$/m);
  assert.match(home, /^type: home$/m);
  assert.match(home, /^next: \/2026-08\/2026-08-03$/m);
  assert.match(home, /\{\{< latest-daily >\}\}/);
  assert.doesNotMatch(home, /^# AI 生命延续学日报$/m);
  assert.doesNotMatch(home, /重磅\s*TOP/i);
  assert.doesNotMatch(home, /aivora\.cn/i);
});

test('an older rerun cannot point the homepage away from a newer daily', () => {
  const current = `---\ntitle: AI 生命延续学日报\nnext: /2026-08/2026-08-03\n---\n\nExisting`;
  assert.equal(updateHomeIndexContent(current, 'unused', '2026-08-02'), current);
});
