import { buildOpportunityRecordsDocument } from "./opportunityRecords.js";

function urlSet(text) {
  return new Set((String(text).match(/https:\/\/[^\s)<>"]+/g) || []).map((value) => {
    try {
      const url = new URL(value.replace(/[.,;，。；]+$/, ""));
      url.hash = "";
      for (const key of ["utm_source", "utm_medium", "utm_campaign"]) url.searchParams.delete(key);
      return url.toString();
    } catch { return ""; }
  }).filter(Boolean));
}

export function assessOpportunitySourceGate(markdown, { date, section, allowedSourceUrls = null }) {
  const document = buildOpportunityRecordsDocument(markdown, { date, section });
  if (document.extraction_status === "no_qualifying_project") {
    return { publishable: true, missing: [], extraction_status: document.extraction_status };
  }
  const allowed = allowedSourceUrls === null ? null : urlSet(allowedSourceUrls);
  const missing = document.opportunities.filter((item) => !item.source_urls.some((url) => allowed === null || allowed.has(url))).map((item) => item.title);
  return {
    publishable: document.extraction_status === "candidates_extracted" && missing.length === 0,
    missing,
    extraction_status: document.extraction_status,
  };
}

/** A bounded editorial retry. No page or sidecar writes happen before this passes. */
export async function generateWithSourceGate(generate, prompt, options) {
  let markdown = await generate(prompt);
  let gate = assessOpportunitySourceGate(markdown, { ...options, allowedSourceUrls: prompt });
  if (gate.publishable) return markdown;
  const correction = [
    prompt,
    "\n\n自动发布门禁：上次草稿未通过，因为“今日主推”或“今日优先项目”中有条目缺少可解析的原始 HTTPS 链接。",
    "请仅使用本次输入素材中真实存在的 URL，在每个条目的“证据来源”行写出完整 HTTPS URL；不要猜测、补造 DOI 或论文链接。",
    "如确实没有可核查链接，就不要把该条目列为主推；项目商机没有合格条目时，明确写“今日无符合筛选标准的项目”。",
  ].join("\n");
  markdown = await generate(correction);
  gate = assessOpportunitySourceGate(markdown, { ...options, allowedSourceUrls: prompt });
  if (!gate.publishable) {
    throw new Error(`Source-link gate blocked ${options.section} publication: ${gate.extraction_status}; ${gate.missing.length} main item(s) lack URLs`);
  }
  return markdown;
}
