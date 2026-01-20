# BioAI Output Cleanup & Image Sanitization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove duplicate section headings, disable image proxy usage, and sanitize broken images before saving daily/blog content.

**Architecture:** Add a markdown image sanitizer in helpers, wire it into GitHub commit and RSS save paths, and adjust prompts/config to prevent duplicate headings and model filtering issues.

**Tech Stack:** Cloudflare Workers (JS), Node built-in test runner.

---

### Task 1: Add minimal test scaffold for image sanitization

**Files:**
- Create: `package.json`
- Create: `tests/sanitizeMarkdownImages.test.mjs`

**Step 1: Write the failing test**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMarkdownImages } from '../src/helpers.js';

test('removes unavailable markdown images and keeps original link', async () => {
  const markdown = '![ok](https://ok.com/a.png)\n![bad](https://bad.com/b.png)';
  const fetchFn = async (url, options) => {
    if (url === 'https://ok.com/a.png') return { ok: true, status: 200 };
    if (url === 'https://bad.com/b.png') return { ok: false, status: 404 };
    return { ok: false, status: 500 };
  };
  const output = await sanitizeMarkdownImages(markdown, { fetchFn });
  assert.match(output, /https:\/\/ok\.com\/a\.png/);
  assert.match(output, /图片暂不可用/);
  assert.match(output, /https:\/\/bad\.com\/b\.png/);
});

```

**Step 2: Run test to verify it fails**

Run: `node --test tests/sanitizeMarkdownImages.test.mjs`
Expected: FAIL (`sanitizeMarkdownImages` not found).

**Step 3: Commit**

```bash
git add package.json tests/sanitizeMarkdownImages.test.mjs
git commit -m "test: add sanitizeMarkdownImages coverage"
```

---

### Task 2: Implement sanitizeMarkdownImages in helpers

**Files:**
- Modify: `src/helpers.js`

**Step 1: Write minimal implementation**

- Add `sanitizeMarkdownImages(markdown, { fetchFn, maxImages, timeoutMs, concurrency })`.
- Validate only http/https external URLs; skip data/blob/relative.
- Use HEAD, fall back to GET+Range on 405/403.
- Replace broken images with `（图片暂不可用，原图链接：<url>）`.

**Step 2: Run test to verify it passes**

Run: `node --test tests/sanitizeMarkdownImages.test.mjs`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/helpers.js
git commit -m "feat: sanitize markdown images"
```

---

### Task 3: Wire sanitization into save paths

**Files:**
- Modify: `src/handlers/commitToGitHub.js`
- Modify: `src/handlers/writeRssData.js`

**Step 1: Update handlers**

- Call `sanitizeMarkdownImages` after `formatMarkdownText`, before saving to GitHub/RSS.
- Await async sanitization.

**Step 2: Run test to verify still passes**

Run: `node --test tests/sanitizeMarkdownImages.test.mjs`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/handlers/commitToGitHub.js src/handlers/writeRssData.js
git commit -m "feat: sanitize images before save"
```

---

### Task 4: Remove duplicate headings and quick nav

**Files:**
- Modify: `src/prompt/summarizationPromptStepTwo.js`
- Modify: `src/handlers/genAIContent.js`
- Modify: `src/handlers/scheduled.js`

**Step 1: Edit prompt and nav**

- Remove `## **今日 AI 资讯**` title requirement from StepTwo prompt.
- Remove quick-nav line linking to `#今日ai资讯`.

**Step 2: Manual check**

Expected: Generated markdown has only the date title + 今日摘要; no secondary “今日AI资讯” header.

**Step 3: Commit**

```bash
git add src/prompt/summarizationPromptStepTwo.js src/handlers/genAIContent.js src/handlers/scheduled.js
git commit -m "chore: remove duplicate daily headings"
```

---

### Task 5: Remove Anthropic thinking filter

**Files:**
- Modify: `src/chatapi.js`

**Step 1: Update Anthropic parsing**

- Return/join all text blocks without filtering.
- Stream: remove `currentBlockType` gating and always yield text deltas.

**Step 2: Manual check**

Expected: Claude responses are not truncated; no special filtering logic remains.

**Step 3: Commit**

```bash
git add src/chatapi.js
git commit -m "fix: return full anthropic text"
```

---

### Task 6: Disable proxy

**Files:**
- Modify: `wrangler.toml`

**Step 1: Update config**

- Set `IMG_PROXY = ""` to disable proxy usage.

**Step 2: Manual check**

Expected: Image proxy no longer applied.

**Step 3: Commit**

```bash
git add wrangler.toml
git commit -m "chore: disable image proxy"
```
