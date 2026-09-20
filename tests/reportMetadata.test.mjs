import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReportDescription,
  extractFirstReportImage,
  extractReportTopics,
  stripLeadingReportHeading,
} from "../src/utils/reportMetadata.js";

const report = `# AI生命延续学日报

报告日期：2026-09-20

## 今日摘要

## 先看信号（可引用判断）

### AI 衰老时钟进入多器官验证

这里是正文。

### 蛋白质设计模型开放研究接口

更多正文。

![器官衰老图](https://example.com/aging-clock.jpg)
`;

test("report metadata extracts useful topics and ignores boilerplate headings", () => {
  assert.deepEqual(extractReportTopics(report), [
    "AI 衰老时钟进入多器官验证",
    "蛋白质设计模型开放研究接口",
  ]);
});

test("report description is date-specific and topic-specific", () => {
  const description = buildReportDescription(report, {
    dateStr: "2026-09-20",
    label: "AI生命延续学日报",
  });

  assert.match(description, /2026-09-20 AI生命延续学日报/);
  assert.match(description, /AI 衰老时钟进入多器官验证/);
  assert.ok(description.length <= 155);
});

test("report publication removes only the leading H1 and report date", () => {
  const body = stripLeadingReportHeading(report);
  assert.doesNotMatch(body, /^#\s/m);
  assert.doesNotMatch(body, /报告日期/);
  assert.match(body, /^## 今日摘要/);
});

test("report metadata extracts the first public image", () => {
  assert.equal(extractFirstReportImage(report), "https://example.com/aging-clock.jpg");
  assert.equal(extractFirstReportImage("<img src='https://example.com/figure.png' alt='figure'>"), "https://example.com/figure.png");
});
