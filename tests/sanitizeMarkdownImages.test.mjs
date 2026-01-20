import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMarkdownImages } from '../src/helpers.js';

test('removes unavailable markdown images and keeps original link', async () => {
  const markdown = '![ok](https://ok.com/a.png)\n![bad](https://bad.com/b.png)';
  const fetchFn = async (url) => {
    if (url === 'https://ok.com/a.png') return { ok: true, status: 200 };
    if (url === 'https://bad.com/b.png') return { ok: false, status: 404 };
    return { ok: false, status: 500 };
  };

  const output = await sanitizeMarkdownImages(markdown, { fetchFn });

  assert.match(output, /https:\/\/ok\.com\/a\.png/);
  assert.match(output, /图片暂不可用/);
  assert.match(output, /https:\/\/bad\.com\/b\.png/);
});
