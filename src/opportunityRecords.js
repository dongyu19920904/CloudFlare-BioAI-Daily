const SECTION_HEADING = /^##\s+今日主推\s*$/m;
const NEXT_HEADING = /^##\s+/m;
const ITEM_HEADING = /^###\s+(.+)$/gm;
const URL_PATTERN = /https?:\/\/[^\s)<>\]"']+/g;
import { discoverPrimarySourceCandidates } from "./primarySourceDiscovery.js";

function normalizeText(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function stableHash(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function extractField(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`^\\s*-\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[:：]\\s*(.*)$`, "m");
  const match = body.match(expression);
  return match ? normalizeText(match[1]) : "";
}

function canonicalUrl(raw) {
  try {
    const url = new URL(raw.replace(/[.,;，。；]+$/, ""));
    if (!["https:", "http:"].includes(url.protocol)) return null;
    url.hash = "";
    if (url.hostname === "doi.org" || url.hostname === "dx.doi.org") {
      return `https://doi.org/${decodeURIComponent(url.pathname).replace(/^\//, "").toLowerCase()}`;
    }
    url.hostname = url.hostname.toLowerCase();
    url.searchParams.delete("utm_source");
    url.searchParams.delete("utm_medium");
    url.searchParams.delete("utm_campaign");
    return url.toString();
  } catch {
    return null;
  }
}

function extractUrls(value) {
  return [...new Set((value.match(URL_PATTERN) || []).map(canonicalUrl).filter(Boolean))];
}

function findMainSection(markdown) {
  const match = SECTION_HEADING.exec(markdown);
  if (!match) return "";
  const remaining = markdown.slice(match.index + match[0].length);
  const next = NEXT_HEADING.exec(remaining);
  return next ? remaining.slice(0, next.index) : remaining;
}

function sectionsFromMain(main) {
  const headings = [...main.matchAll(ITEM_HEADING)];
  return headings.map((heading, index) => ({
    title: normalizeText(heading[1]),
    body: main.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? main.length),
  }));
}

function routeFor(title, deliverable) {
  const text = `${title} ${deliverable}`;
  if (/GitHub|开源|代码|项目试跑/i.test(text)) return "open_source_adaptation";
  if (/资料库|清单|对比表|资料包/.test(text)) return "structured_resource";
  if (/工具|生成器|应用/.test(text)) return "interactive_tool";
  return "content";
}

/**
 * Converts the published Markdown convention into conservative machine records.
 * Extraction is not scientific verification: no record is marked verified here.
 */
export function extractOpportunityRecords(markdown, { date, section = "opportunity" } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    throw new Error("A YYYY-MM-DD report date is required");
  }
  if (!["opportunity", "project-opportunity"].includes(section)) {
    throw new Error("Unsupported opportunity section");
  }
  const main = findMainSection(String(markdown || ""));
  const seen = new Set();
  const records = [];
  for (const { title, body } of sectionsFromMain(main)) {
    if (!title) continue;
    const sourceText = extractField(body, "证据来源");
    const sourceUrls = extractUrls(sourceText);
    const deliverable = extractField(body, "可交付物");
    const buyer = extractField(body, "目标鱼塘");
    const demandClaim = extractField(body, "痛点和付费理由");
    // Correcting a secondary link to a primary source must not create a new task.
    const canonicalKey = `${section}|${normalizeText(title).toLowerCase()}`;
    const opportunityId = `opp_${stableHash(canonicalKey)}`;
    if (seen.has(opportunityId)) continue;
    seen.add(opportunityId);
    const riskFlags = [];
    if (/治疗|诊断|逆转|延长寿命|痴呆|医疗|患者|轻咨询/.test(`${title} ${body}`)) riskFlags.push("health_claim_review");
    if (/\d+(?:\.\d+)?\s*元|阅读量|点赞|付费|收入/.test(body)) riskFlags.push("commercial_hypothesis");
    const state = sourceUrls.length ? "needs_primary_source" : "missing_source";
    records.push({
      schema_version: 1,
      opportunity_id: opportunityId,
      report_date: date,
      report_section: section,
      title,
      source_urls: sourceUrls,
      source_verified: false,
      state,
      state_reason: sourceUrls.length ? "已提取报道链接；尚未核验一手论文、试验或项目来源" : "缺少可解析的来源链接",
      target_user: buyer || null,
      demand_claim: demandClaim || null,
      demand_verified: false,
      deliverable_hint: deliverable || null,
      suggested_route: routeFor(title, deliverable),
      risk_flags: riskFlags,
      hypotheses: {
        success_metric: extractField(body, "成功指标") || null,
        stop_condition: extractField(body, "停止条件") || null,
        upgrade_path: extractField(body, "复购或升级路径") || null,
      },
    });
  }
  return records;
}

export function buildOpportunityRecordsDocument(markdown, options) {
  return {
    schema_version: 1,
    report_date: options.date,
    report_section: options.section,
    source_page: `/${options.section}/${options.date.slice(0, 7)}/${options.date}/`,
    extraction_note: "机器提取不等于科学或商业核验；所有主推需继续查一手来源与真实需求。",
    opportunities: extractOpportunityRecords(markdown, options),
  };
}

export function buildOpportunityRecordsPath(date, section) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("Invalid report date");
  if (!["opportunity", "project-opportunity"].includes(section)) throw new Error("Invalid report section");
  return `static/data/opportunities/${section}/${date}.json`;
}

/** An idempotent GitHub sidecar write; injected I/O keeps tests offline. */
export async function commitOpportunityRecords(env, date, section, markdown, github, fetcher = fetch) {
  const document = buildOpportunityRecordsDocument(markdown, { date, section });
  for (const record of document.opportunities) {
    record.primary_source_candidates = await discoverPrimarySourceCandidates(record, fetcher);
    if (record.primary_source_candidates.length) {
      record.state = "needs_claim_check";
      record.state_reason = "已自动找到可核查的论文 DOI；DOI 存在不等于报道关系或医学结论得到验证";
    }
  }
  const filePath = buildOpportunityRecordsPath(date, section);
  const content = `${JSON.stringify(document, null, 2)}\n`;
  const existingSha = await github.getSha(env, filePath);
  if (existingSha && await github.getContent(env, filePath) === content) {
    return { filePath, count: document.opportunities.length, changed: false };
  }
  await github.write(
    env,
    filePath,
    content,
    `${existingSha ? "Update" : "Create"} ${section} opportunity records for ${date}`,
    existingSha
  );
  return { filePath, count: document.opportunities.length, changed: true };
}
