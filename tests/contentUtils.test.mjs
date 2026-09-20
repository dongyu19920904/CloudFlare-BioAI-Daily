import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDailyContentWithFrontMatter,
  updateHomeIndexContent,
} from "../src/contentUtils.js";

const markdown = `# AI生命延续学日报

### 多器官衰老时钟完成外部验证

![研究图](https://example.com/clock.png)

这项研究仍需要更多人群验证。`;

test("daily page metadata follows the current report", () => {
  const page = buildDailyContentWithFrontMatter("2026-09-20", markdown, {
    title: "AI生命延续学日报 2026年9月20日",
  });

  assert.match(page, /description: '2026-09-20 AI生命延续学日报：多器官衰老时钟完成外部验证/);
  assert.match(page, /images:\n  - 'https:\/\/example\.com\/clock\.png'/);
  assert.doesNotMatch(page.split("---")[2], /^\s*#\s/m);
});

test("daily homepage refreshes a previously generic description", () => {
  const existing = `---
title: Old title
linkTitle: BioAI
next: /2026-09/2026-09-19
description: 'old generic description'
---

Old content`;
  const page = updateHomeIndexContent(existing, markdown, "2026-09-20", {
    title: "AI生命延续学日报 2026年9月20日",
  });

  assert.match(page, /description: '2026-09-20 AI生命延续学日报：多器官衰老时钟完成外部验证/);
  assert.match(page, /^next: \/2026-09\/2026-09-20$/m);
});
