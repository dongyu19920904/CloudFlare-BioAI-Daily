import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDailyBody } from "../src/helpers.js";

test("normalizeDailyBody adds numbering to TOP items when missing", () => {
    const input = `
前言草稿

## **今日 AI 生命科学资讯**

## **🔥 重磅 TOP 3**

### [第一条新闻](https://example.com/1)

内容 1

### [第二条新闻](https://example.com/2)

内容 2

### [第三条新闻](https://example.com/3)

内容 3

---

## **📌 值得关注**
`;

    const output = normalizeDailyBody(input);

    assert.match(output, /### 1\. \[第一条新闻\]\(https:\/\/example\.com\/1\)/);
    assert.match(output, /### 2\. \[第二条新闻\]\(https:\/\/example\.com\/2\)/);
    assert.match(output, /### 3\. \[第三条新闻\]\(https:\/\/example\.com\/3\)/);
});

test("normalizeDailyBody preserves existing numbering", () => {
    const input = `
## **今日 AI 生命科学资讯**

## **🔥 重磅 TOP 2**

### 1. [第一条新闻](https://example.com/1)

内容 1

### 2. [第二条新闻](https://example.com/2)

内容 2
`;

    const output = normalizeDailyBody(input);

    assert.equal((output.match(/### 1\. /g) || []).length, 1);
    assert.equal((output.match(/### 2\. /g) || []).length, 1);
});

console.log("top numbering tests passed");
