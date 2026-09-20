import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBioSectionPageContent,
  buildBioSectionMonthIndexContent,
  buildBioSectionPaths,
  updateBioSectionHomeIndexContent,
} from "../src/bioOpportunityUtils.js";

test("buildBioSectionPaths writes opportunity pages under month directories", () => {
  assert.deepEqual(buildBioSectionPaths("2026-06-19", "opportunity"), {
    yearMonth: "2026-06",
    pagePath: "content/cn/opportunity/2026-06/2026-06-19.md",
    monthIndexPath: "content/cn/opportunity/2026-06/_index.md",
    homePath: "content/cn/opportunity/_index.md",
    publicPath: "/opportunity/2026-06/2026-06-19/",
  });
});

test("buildBioSectionPaths writes project opportunity pages under month directories", () => {
  assert.equal(
    buildBioSectionPaths("2026-06-19", "project-opportunity").pagePath,
    "content/cn/project-opportunity/2026-06/2026-06-19.md"
  );
});

test("updateBioSectionHomeIndexContent points next to the month directory page", () => {
  const updated = updateBioSectionHomeIndexContent("", "## Body", "2026-06-19", {
    title: "Opportunity",
    linkTitle: "Opportunity",
    description: "Daily opportunity notes",
    sectionPrefix: "/opportunity",
  });

  assert.match(updated, /^next: \/opportunity\/2026-06\/2026-06-19\//m);
});

test("buildBioSectionMonthIndexContent builds a sidebar-open month index", () => {
  const monthIndex = buildBioSectionMonthIndexContent("2026-06", { sidebarOpen: true });

  assert.match(monthIndex, /^title: 2026-06$/m);
  assert.match(monthIndex, /^  open: true$/m);
});

test("buildBioSectionPageContent creates unique metadata and removes duplicate H1", () => {
  const markdown = `# AI生命延续学商机日报

### 生物年龄报告解读服务

![报告示例](https://example.com/report.png)

今天验证一份低风险交付。`;
  const page = buildBioSectionPageContent("2026-09-20", markdown, {
    section: "opportunity",
    title: "AI生命延续学商机日报 2026年9月20日",
    linkTitle: "09-20-商机",
  });

  assert.match(page, /description: '2026-09-20 AI生命延续学商机日报：生物年龄报告解读服务/);
  assert.match(page, /images:\n  - 'https:\/\/example\.com\/report\.png'/);
  assert.doesNotMatch(page.split("---")[2], /^\s*#\s/m);
  assert.match(page, /^title: 'AI生命延续学商机日报 2026年9月20日'$/m);
});
