const TASK_DESCRIPTIONS = {
  discover_primary_source: "自动继续检索一手论文、试验或机构来源",
  verify_claims: "自动对照一手来源核查研究类型、对象、结论和局限",
  inspect_repository: "自动核查仓库许可证、数据入口、依赖、维护状态和试跑条件",
  validate_demand: "自动整理真实用户问题与替代方案；缺少行为数据时保持需求未验证",
  deliver_project: "在受控环境运行或小范围改造项目，记录真实输入输出与测试",
  produce_media: "从已核验事实和已交付项目生成多渠道内容与视频包",
};

function task(record, kind, dependencies = [], status = "pending_automation") {
  return {
    task_id: `${record.opportunity_id}:${kind}`,
    opportunity_id: record.opportunity_id,
    kind,
    status,
    description_zh: TASK_DESCRIPTIONS[kind],
    depends_on: dependencies.map((dependency) => `${record.opportunity_id}:${dependency}`),
  };
}

/** Create honest next tasks; this plans work but does not claim it ran. */
export function buildOpportunityTasks(records) {
  const tasks = [];
  for (const record of records) {
    const isRepository = record.source_urls?.some((value) => /^https:\/\/github\.com\/[^/]+\/[^/]+/i.test(value));
    const evidenceKind = isRepository ? "inspect_repository"
      : record.primary_source_candidates?.length ? "verify_claims"
        : "discover_primary_source";
    const evidenceReady = isRepository ? record.repository_verified === true : record.source_verified === true;
    const demandReady = record.demand_verified === true;
    const evidenceStatus = record.state === "blocked_license_unknown" ? "blocked_license_unknown"
      : record.state === "blocked_repository_inactive" ? "blocked_repository_inactive"
        : evidenceReady ? "completed" : "pending_automation";
    tasks.push(task(record, evidenceKind, [], evidenceStatus));
    tasks.push(task(record, "validate_demand", [], demandReady ? "completed" : "pending_automation"));
    if (evidenceReady && demandReady && !record.risk_flags?.includes("health_claim_review")) {
      tasks.push(task(record, "deliver_project", [evidenceKind, "validate_demand"]));
      tasks.push(task(record, "produce_media", ["deliver_project"]));
    }
  }
  return tasks;
}
