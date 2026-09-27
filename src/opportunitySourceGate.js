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
  // A report may say "no qualifying project" yet still propose a risky side
  // opportunity. Check the entire public page before that early exit.
  const unsafeHealthSelfAssessment = /自测|自评|自检|风险评分|症状清单/.test(markdown)
    && (document.opportunities.some((item) => item.risk_flags?.includes("health_claim_review"))
      || /免疫|衰老|健康|疾病|治疗|诊断/.test(markdown));
  if (document.extraction_status === "no_qualifying_project") {
    return { publishable: !unsafeHealthSelfAssessment, missing: [], unsafe_health_self_assessment: unsafeHealthSelfAssessment, extraction_status: document.extraction_status };
  }
  const allowed = allowedSourceUrls === null ? null : urlSet(allowedSourceUrls);
  const missing = document.opportunities.filter((item) => !item.source_urls.some((url) => allowed === null || allowed.has(url))).map((item) => item.title);
  // A research/news source is not validation for a consumer diagnostic checklist.
  // Fail closed even if the wording is in a disclaimer: the model can retry
  // without proposing or repeating the unsupported product.
  return {
    publishable: document.extraction_status === "candidates_extracted" && missing.length === 0 && !unsafeHealthSelfAssessment,
    missing,
    unsafe_health_self_assessment: unsafeHealthSelfAssessment,
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
    "\n\n自动发布门禁：上次草稿未通过。",
    "请仅使用本次输入素材中真实存在的 URL，在每个条目的“证据来源”行写出完整 HTTPS URL；不要猜测、补造 DOI 或论文链接。",
    "健康研究线索不能直接做成面向个人的自测、自评、自检、风险评分或症状清单，尤其不能把动物实验当作人体检测方法。请从所有章节删除这类产品、引流和操作建议；只保留研究阶段、来源和局限。",
    "如确实没有可核查链接，就不要把该条目列为主推；项目商机没有合格条目时，明确写“今日无符合筛选标准的项目”。",
  ].join("\n");
  markdown = await generate(correction);
  gate = assessOpportunitySourceGate(markdown, { ...options, allowedSourceUrls: prompt });
  if (!gate.publishable) {
    throw new Error(`Opportunity publication gate blocked ${options.section}: ${gate.extraction_status}; ${gate.missing.length} main item(s) lack URLs; unsafe health self-assessment=${gate.unsafe_health_self_assessment}`);
  }
  return markdown;
}
