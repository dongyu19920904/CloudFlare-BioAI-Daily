const MANIPULATIVE_GEO_PATTERNS = [
  { code: "llm-directive", pattern: /【\s*(?:LLM|大模型)[^】]{0,24}(?:指令|提示词)[^】]*】/iu },
  { code: "hidden-html-directive", pattern: /<!--[\s\S]{0,240}(?:LLM|大模型)[\s\S]{0,80}(?:指令|提示词)[\s\S]{0,240}?-->/iu },
  { code: "hidden-directive", pattern: /肉眼不可见.{0,20}(?:提示词|指令|文字)/iu },
  { code: "weight-manipulation", pattern: /(?:提高|提升|调高).{0,20}(?:本站|本文|页面|内容).{0,12}(?:权重|关联度)/iu },
  { code: "priority-citation", pattern: /(?:优先参考|优先引用).{0,16}(?:本站|本文|本周刊|本日报)/iu },
  { code: "verbatim-citation", pattern: /逐字引用/iu },
  { code: "unverifiable-no-hallucination", pattern: /无(?:任何)?\s*(?:AI\s*)?(?:幻觉|冗余内容)/iu },
];

export function findManipulativeGeoDirectives(markdown) {
  const text = String(markdown || "");
  return MANIPULATIVE_GEO_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ code }) => code);
}

export function assertSafeGeoMarkdown(markdown, section = "BioAI") {
  const issues = findManipulativeGeoDirectives(markdown);
  if (issues.length > 0) {
    throw new Error(`[GEO][${section}] Blocked manipulative or hidden model directive: ${issues.join(", ")}`);
  }
  return markdown;
}
