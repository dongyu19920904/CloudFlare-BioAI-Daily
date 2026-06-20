import { buildMonthDirectoryIndex, getYearMonth } from "./contentUtils.js";

const FRONT_MATTER_REGEX = /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/;

export const DEFAULT_BIO_OPPORTUNITY_DESCRIPTION =
  "从 AI 生命延续学资讯里提炼可验证、可低成本测试的内容、产品和服务机会。";

export const DEFAULT_BIO_PROJECT_OPPORTUNITY_DESCRIPTION =
  "从 AI 生命延续学开源项目和研究线索里筛选可跟进的项目机会。";

function getMonthDay(dateStr) {
  return typeof dateStr === "string" ? dateStr.slice(5, 10) : "";
}

function computeWeight(dateStr) {
  const day = Number.parseInt(String(dateStr).slice(8, 10), 10);
  if (!Number.isFinite(day)) return 0;
  const weight = 32 - day;
  return weight > 0 ? weight : 0;
}

function stripFrontMatter(content) {
  return String(content || "").replace(FRONT_MATTER_REGEX, "");
}

function replaceOrInsertFrontMatterLine(frontMatter, field, value) {
  const pattern = new RegExp(`^${field}:\\s*.*$`, "m");

  if (pattern.test(frontMatter)) {
    return frontMatter.replace(pattern, `${field}: ${value}`);
  }

  return frontMatter.replace(/\r?\n---\s*\r?\n$/, `\n${field}: ${value}\n---\n`);
}

export function buildBioSectionPaths(dateStr, section) {
  const yearMonth = getYearMonth(dateStr);
  return {
    yearMonth,
    pagePath: `content/cn/${section}/${yearMonth}/${dateStr}.md`,
    monthIndexPath: `content/cn/${section}/${yearMonth}/_index.md`,
    homePath: `content/cn/${section}/_index.md`,
    publicPath: `/${section}/${yearMonth}/${dateStr}/`,
  };
}

export function buildBioSectionMonthIndexContent(yearMonth, options = {}) {
  return buildMonthDirectoryIndex(yearMonth, options);
}

export function buildBioSectionPageContent(dateStr, content, options = {}) {
  const {
    title = `${getMonthDay(dateStr)}-${options.linkTitle || "商机"}`,
    linkTitle = getMonthDay(dateStr),
    description = DEFAULT_BIO_OPPORTUNITY_DESCRIPTION,
  } = options;
  const body = stripFrontMatter(content).trimStart();

  return `---
linkTitle: ${linkTitle}
title: ${title}
weight: ${computeWeight(dateStr)}
breadcrumbs: false
comments: true
description: "${description}"
---

${body}`;
}

function buildBioSectionHomeFrontMatter(dateStr, options = {}) {
  const {
    title = "AI生命延续学商机",
    linkTitle = title,
    description = DEFAULT_BIO_OPPORTUNITY_DESCRIPTION,
    sectionPrefix = "/opportunity",
    nextPath,
  } = options;
  const resolvedNextPath = nextPath || `${sectionPrefix}/${getYearMonth(dateStr)}/${dateStr}/`;

  return `---
linkTitle: ${linkTitle}
title: ${title}
breadcrumbs: false
next: ${resolvedNextPath}
description: "${description}"
cascade:
  type: docs
---
`;
}

export function updateBioSectionHomeIndexContent(existingContent, sectionContent, dateStr, options = {}) {
  const {
    title = "AI生命延续学商机",
    linkTitle = title,
    description = DEFAULT_BIO_OPPORTUNITY_DESCRIPTION,
    sectionPrefix = "/opportunity",
    nextPath,
  } = options;
  const resolvedNextPath = nextPath || `${sectionPrefix}/${getYearMonth(dateStr)}/${dateStr}/`;
  let frontMatter = "";

  if (existingContent && FRONT_MATTER_REGEX.test(existingContent)) {
    frontMatter = existingContent.match(FRONT_MATTER_REGEX)[0];
    frontMatter = replaceOrInsertFrontMatterLine(frontMatter, "next", resolvedNextPath);
    frontMatter = replaceOrInsertFrontMatterLine(frontMatter, "title", title);
    frontMatter = replaceOrInsertFrontMatterLine(frontMatter, "linkTitle", linkTitle);
    frontMatter = replaceOrInsertFrontMatterLine(frontMatter, "description", `"${description}"`);
  } else {
    frontMatter = buildBioSectionHomeFrontMatter(dateStr, {
      title,
      linkTitle,
      description,
      sectionPrefix,
      nextPath: resolvedNextPath,
    });
  }

  const body = stripFrontMatter(sectionContent).trimStart();
  return `${frontMatter.trimEnd()}\n\n${body}`;
}
