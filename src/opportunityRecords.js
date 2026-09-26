const NEXT_HEADING = /^##\s+/m;
const ITEM_HEADING = /^###\s+(.+)$/gm;
const URL_PATTERN = /https?:\/\/[^\s)<>\]"']+/g;
import { discoverPrimarySourceCandidates } from "./primarySourceDiscovery.js";
import { buildOpportunityTasks } from "./opportunityRouting.js";
import { screenRepository } from "./repositoryScreening.js";

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

function findMainSection(markdown, section) {
  const heading = section === "project-opportunity" ? "今日优先项目" : "今日主推";
  const match = new RegExp(`^##\\s+${heading}\\s*$`, "m").exec(markdown);
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
  const main = findMainSection(String(markdown || ""), section);
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
    const hasRepository = sourceUrls.some((value) => /^https:\/\/github\.com\/[^/]+\/[^/]+/i.test(value));
    const state = !sourceUrls.length ? "missing_source" : hasRepository ? "needs_repository_check" : "needs_primary_source";
    records.push({
      schema_version: 1,
      opportunity_id: opportunityId,
      report_date: date,
      report_section: section,
      title,
      source_urls: sourceUrls,
      source_verified: false,
      state,
      state_reason: !sourceUrls.length ? "缺少可解析的来源链接" : hasRepository ? "已提取仓库链接；尚未核验许可证、数据和可运行性" : "已提取报道链接；尚未核验一手论文、试验或项目来源",
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
  const opportunities = extractOpportunityRecords(markdown, options);
  const intentionalEmpty = options.section === "project-opportunity" && /今日无符合筛选标准的项目|今日无项目通过验证|今日无项目可试跑/.test(markdown);
  return {
    schema_version: 1,
    report_date: options.date,
    report_section: options.section,
    source_page: `/${options.section}/${options.date.slice(0, 7)}/${options.date}/`,
    extraction_note: "机器提取不等于科学或商业核验；所有主推需继续查一手来源与真实需求。",
    extraction_status: opportunities.length ? "candidates_extracted" : intentionalEmpty ? "no_qualifying_project" : "no_main_items",
    opportunities,
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
  const filePath = buildOpportunityRecordsPath(date, section);
  const existingSha = await github.getSha(env, filePath);
  let existingContent = "";
  if (existingSha) existingContent = await github.getContent(env, filePath);
  let previous = new Map();
  try {
    const parsed = JSON.parse(existingContent);
    if (parsed.report_date === date && parsed.report_section === section && Array.isArray(parsed.opportunities)) {
      previous = new Map(parsed.opportunities.map((item) => [item.opportunity_id, item]));
    }
  } catch { /* A damaged previous sidecar does not block self-healing. */ }
  const deadline = Date.now() + 20_000;
  for (const record of document.opportunities) {
    if (record.state === "needs_repository_check") {
      record.repository_metadata = await screenRepository(record, fetcher);
      if (record.repository_metadata) {
        if (record.repository_metadata.archived || record.repository_metadata.disabled) {
          record.state = "blocked_repository_inactive";
          record.state_reason = "仓库已归档或停用；自动项目改造已暂停";
        } else if (!record.repository_metadata.license_spdx) {
          record.state = "blocked_license_unknown";
          record.state_reason = "未识别明确的代码许可证；自动项目改造已暂停";
        } else {
          record.state = "needs_input_check";
          record.state_reason = "已找到仓库元数据和许可证标识；数据入口、授权义务与核心功能仍需受控验证";
        }
      }
      continue;
    }
    const discovered = await discoverPrimarySourceCandidates(record, fetcher, deadline);
    const retained = (previous.get(record.opportunity_id)?.primary_source_candidates || [])
      .filter((item) => record.source_urls.includes(item.discovered_from));
    record.primary_source_candidates = [...new Map([...retained, ...discovered].map((item) => [item.doi, item])).values()];
    if (record.primary_source_candidates.length) {
      record.state = "needs_claim_check";
      record.state_reason = "已自动找到可核查的论文 DOI；DOI 存在不等于报道关系或医学结论得到验证";
    }
  }
  document.tasks = buildOpportunityTasks(document.opportunities);
  const content = `${JSON.stringify(document, null, 2)}\n`;
  if (existingSha && existingContent === content) {
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
