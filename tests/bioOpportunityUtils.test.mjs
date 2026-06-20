import test from "node:test";
import assert from "node:assert/strict";

import {
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
