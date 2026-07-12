export const AGING_CLOCK_PROJECT_IDS = [
  "epiage-skill",
  "coinstac-brainage-fnc",
  "adna-aging-clocks",
  "pd-biomarker-challenge-scoring",
];

export const PROJECT_PLAN_ROLES = [
  "learner",
  "indie-developer",
  "content-creator",
  "research-team",
];
export const PROJECT_PLAN_DIRECTIONS = [
  "directory",
  "education",
  "interactive-demo",
  "report-tool",
  "content-product",
];
export const PROJECT_PLAN_TIME_BUDGETS = [
  "two-hours",
  "one-day",
  "three-days",
  "seven-days",
];
export const PROJECT_PLAN_EXPERIENCE = [
  "beginner",
  "intermediate",
  "advanced",
];
export const PROJECT_PLAN_DEPLOYMENTS = [
  "static-site",
  "cloudflare",
  "no-deploy",
];

export const PROJECT_PLAN_GOAL_MAX_LENGTH = 240;

export const AGING_CLOCK_PROJECT_CATALOG = {
  "epiage-skill": {
    name: "epiage-skill",
    repositoryUrl: "https://github.com/gangchen/epiage-skill",
    category: "表观遗传年龄时钟",
    facts:
      "Python 离线工具；输入 CpG beta 值；当前 README 列出 25 个时钟；代码 MIT，但 GrimAge 商业使用和第三方系数/参考数据需单独核实。",
    remixIdeas: ["衰老时钟术语地图", "算法覆盖对比页", "研究工作流学习卡"],
    sourceDaily:
      "https://github.com/dongyu19920904/BioAI-Daily-Web/blob/main/content/cn/project-opportunity/2026-07/2026-07-09.md",
  },
  "coinstac-brainage-fnc": {
    name: "coinstac-brainage-fnc",
    repositoryUrl: "https://github.com/trendscenter/coinstac-brainage-fnc",
    category: "脑龄模型",
    facts:
      "COINSTAC/Docker 多中心研究组件；输入 FNC 矩阵和年龄标签；LinearSVR；仓库未发现明确 LICENSE。",
    remixIdeas: ["脑龄算法对比页", "联邦计算流程演示", "神经影像输入格式指南"],
    sourceDaily:
      "https://github.com/dongyu19920904/BioAI-Daily-Web/blob/main/content/cn/project-opportunity/2026-07/2026-07-11.md",
  },
  "adna-aging-clocks": {
    name: "aDNA_aging_clocks",
    repositoryUrl: "https://github.com/Malaevleo/aDNA_aging_clocks",
    category: "古 DNA 年龄时钟",
    facts:
      "将古 DNA 甲基化 BED 映射到 Illumina CpG，再调用 pyaging 的三个时钟；需要外部 manifest；仓库未发现明确 LICENSE。",
    remixIdeas: ["古 DNA 工作流图", "现代/古代时钟差异课", "可复现性检查清单"],
    sourceDaily:
      "https://github.com/dongyu19920904/BioAI-Daily-Web/blob/main/content/cn/2026-07/2026-07-11.md",
  },
  "pd-biomarker-challenge-scoring": {
    name: "PDbiomarkerChallengeScoring",
    repositoryUrl:
      "https://github.com/Sage-Bionetworks/PDbiomarkerChallengeScoring",
    category: "数字生物标志物",
    facts:
      "帕金森数字生物标志物 DREAM Challenge 评分代码；依赖 Synapse 数据和旧版 Python/R；不是临床诊断产品；仓库未发现明确 LICENSE。",
    remixIdeas: ["数字标志物信号地图", "挑战赛评分解释器", "评估指标学习页"],
    sourceDaily:
      "https://github.com/dongyu19920904/BioAI-Daily-Web/blob/main/content/cn/project-opportunity/2026-07/2026-07-11.md",
  },
};

const roleLabels = {
  learner: "学习者",
  "indie-developer": "独立开发者",
  "content-creator": "内容创作者",
  "research-team": "小型研究团队",
};
const directionLabels = {
  directory: "导航网站",
  education: "教育网站",
  "interactive-demo": "交互演示",
  "report-tool": "数据报告工具",
  "content-product": "内容产品",
};
const deploymentLabels = {
  "static-site": "Astro 静态站",
  cloudflare: "Cloudflare",
  "no-deploy": "暂不部署",
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowed(values, value) {
  return typeof value === "string" && values.includes(value);
}

function invalid(field, message) {
  return { ok: false, field, message };
}

const REQUEST_FIELDS = new Set([
  "projectId",
  "role",
  "direction",
  "timeBudget",
  "experience",
  "deployment",
  "goal",
]);

const piiPattern = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b1[3-9]\d{9}\b|\b\d{13,}\b)/i;

export function validateAgingClockPlanRequest(input) {
  if (!isRecord(input)) return invalid("request", "请求必须是 JSON 对象。");
  const extraField = Object.keys(input).find(field => !REQUEST_FIELDS.has(field));
  if (extraField) return invalid(extraField, "请求包含未允许的字段。");
  if (!isAllowed(AGING_CLOCK_PROJECT_IDS, input.projectId)) {
    return invalid("projectId", "请选择有效的开源项目。");
  }
  for (const [field, values] of [
    ["role", PROJECT_PLAN_ROLES],
    ["direction", PROJECT_PLAN_DIRECTIONS],
    ["timeBudget", PROJECT_PLAN_TIME_BUDGETS],
    ["experience", PROJECT_PLAN_EXPERIENCE],
    ["deployment", PROJECT_PLAN_DEPLOYMENTS],
  ]) {
    if (!isAllowed(values, input[field])) {
      return invalid(field, `${field} 不是允许的选项。`);
    }
  }
  if (typeof input.goal !== "string") {
    return invalid("goal", "项目目标必须是文本。");
  }
  const goal = input.goal.trim();
  if (goal.length > PROJECT_PLAN_GOAL_MAX_LENGTH) {
    return invalid(
      "goal",
      `项目目标不能超过 ${PROJECT_PLAN_GOAL_MAX_LENGTH} 个字符。`
    );
  }
  if (piiPattern.test(goal)) {
    return invalid("goal", "项目目标不能包含邮箱、手机号或长数字标识。");
  }
  return {
    ok: true,
    value: {
      projectId: input.projectId,
      role: input.role,
      direction: input.direction,
      timeBudget: input.timeBudget,
      experience: input.experience,
      deployment: input.deployment,
      goal,
    },
  };
}

function boundedString(value, maximum = 600) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function stringList(value, maximumItems = 20) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maximumItems &&
    value.every(item => boundedString(item))
  );
}

const PLAN_FIELDS = new Set([
  "title",
  "positioning",
  "targetUsers",
  "mvpFeatures",
  "nonGoals",
  "recommendedStack",
  "dataPlan",
  "implementationSteps",
  "riskAndCompliance",
  "sevenDayPlan",
  "sourceAttribution",
  "disclaimer",
]);

const prohibitedMedicalActionPatterns = [
  /(?:测算|计算|预测|评估).{0,8}(?:个人|用户|患者)?生物年龄/g,
  /(?:个人|用户|患者)?生物年龄.{0,8}(?:测算|计算|预测|评估|结果)/g,
  /(?:诊断|预测|判断|筛查).{0,8}(?:疾病|患病|健康状况|帕金森|癌症)/g,
  /(?:疾病|患病|健康状况|帕金森|癌症).{0,8}(?:诊断|预测|判断|筛查|风险评分)/g,
  /(?:提供|生成|给出|制定|推荐).{0,10}(?:诊断|治疗|用药|药物|检查|剂量)/g,
  /(?:诊断|治疗|用药|药物|检查|手术).{0,8}(?:建议|方案|剂量|推荐|结果)/g,
];

function containsProhibitedMedicalAction(value) {
  const text = JSON.stringify(value);
  for (const pattern of prohibitedMedicalActionPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const prefix = text.slice(Math.max(0, match.index - 8), match.index);
      const explicitlyNegated =
        /(?:不|非|禁止|避免|不得|不能|无需|无须|不应|请勿)[^，。；.!?]{0,6}$/.test(
          prefix
        );
      if (!explicitlyNegated) return true;
    }
  }
  return false;
}

export function validateAgingClockPlan(input) {
  if (!isRecord(input)) return invalid("plan", "路线结果不是 JSON 对象。");
  const extraField = Object.keys(input).find(field => !PLAN_FIELDS.has(field));
  if (extraField) return invalid(extraField, "路线结果包含未允许的字段。");
  for (const field of ["title", "positioning", "disclaimer"]) {
    if (!boundedString(input[field], 1000)) {
      return invalid(field, `${field} 缺失或过长。`);
    }
  }
  for (const field of [
    "targetUsers",
    "mvpFeatures",
    "nonGoals",
    "recommendedStack",
    "dataPlan",
    "implementationSteps",
    "riskAndCompliance",
    "sourceAttribution",
  ]) {
    if (!stringList(input[field])) {
      return invalid(field, `${field} 必须是非空短文本数组。`);
    }
  }
  if (
    !Array.isArray(input.sevenDayPlan) ||
    input.sevenDayPlan.length !== 7 ||
    input.sevenDayPlan.some(
      (item, index) =>
        !isRecord(item) ||
        Object.keys(item).some(key => !["day", "goal", "deliverables"].includes(key)) ||
        item.day !== index + 1 ||
        !boundedString(item.goal) ||
        !stringList(item.deliverables, 8)
    )
  ) {
    return invalid(
      "sevenDayPlan",
      "sevenDayPlan 必须包含第 1～7 天的有效计划。"
    );
  }
  if (
    !input.disclaimer.includes("不构成医学建议") &&
    !/not medical advice/i.test(input.disclaimer)
  ) {
    return invalid("disclaimer", "免责声明必须包含非医疗建议边界。");
  }
  if (containsProhibitedMedicalAction(input)) {
    return invalid("plan", "路线结果包含不允许的医学判断或治疗建议。");
  }
  return { ok: true, value: input };
}

export function parseAgingClockPlan(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 25_000) {
    return invalid("response", "模型输出为空或超过长度限制。");
  }
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return invalid("response", "模型输出不包含 JSON 对象。");
  }
  try {
    return validateAgingClockPlan(
      JSON.parse(raw.slice(firstBrace, lastBrace + 1))
    );
  } catch {
    return invalid("response", "模型输出不是有效 JSON。");
  }
}

export function createAgingClockPlanFallback(request) {
  const project = AGING_CLOCK_PROJECT_CATALOG[request.projectId];
  const role = roleLabels[request.role];
  const direction = directionLabels[request.direction];
  const deployment = deploymentLabels[request.deployment];
  const goal = request.goal || `把 ${project.name} 做成可核验的${direction}`;
  return {
    title: `${project.name}：7 天${direction}改造路线`,
    positioning: `${goal}。面向${role}，只展示公开项目事实、来源和学习路径，不处理真实生物或患者数据。`,
    targetUsers: [role, "AI 与生命科学学习者", "开源项目评估者"],
    mvpFeatures: [
      "官方仓库事实卡与来源追踪",
      "输入、算法、输出、许可证和限制对比",
      project.remixIdeas[0],
      "研究用途与非医疗边界提示",
    ],
    nonGoals: [
      "不测算个人生物年龄",
      "不上传或分析 DNA、甲基化、MRI、病例和患者数据",
      "不提供疾病诊断、治疗或临床有效性结论",
    ],
    recommendedStack: ["Astro", "TypeScript", "原生浏览器交互", deployment],
    dataPlan: [
      "只保存官方仓库公开元数据、README 摘要、许可证状态和来源日期",
      "使用本地结构化数据与构建时校验，不搭建自动抓取或用户数据存储",
      "交互演示只使用明确标注的合成内容，不使用个人生物数据",
    ],
    implementationSteps: [
      "冻结项目事实、未知项和非目标",
      "建立经过校验的数据模型",
      "完成一张真实卡片的纵向切片",
      "补充筛选、比较、详情和来源追踪",
      `按 ${deployment} 偏好完成本地构建与验收`,
    ],
    riskAndCompliance: [
      project.facts,
      "许可证不明确或第三方资源条款未核实时，只展示摘要和原链接",
      "不得把研究输出解释成个人健康、疾病或治疗结论",
    ],
    sevenDayPlan: [
      { day: 1, goal: "核实事实和边界", deliverables: ["来源清单", "非目标清单"] },
      { day: 2, goal: "建立数据模型", deliverables: ["字段定义", "数据校验"] },
      { day: 3, goal: "完成首张卡片", deliverables: ["独立路由", "来源链接"] },
      { day: 4, goal: "补齐核心交互", deliverables: ["筛选", "比较"] },
      { day: 5, goal: "补齐详情和合规", deliverables: ["详情视图", "风险提示"] },
      { day: 6, goal: "验证质量", deliverables: ["测试结果", "可访问性检查"] },
      { day: 7, goal: "交付可运行 MVP", deliverables: ["构建产物", "运行与限制说明"] },
    ],
    sourceAttribution: [
      project.repositoryUrl,
      `AI 延续学日报来源：${project.sourceDaily}`,
    ],
    disclaimer:
      "本路线仅用于开源项目学习与网站规划，不构成医学建议；请勿输入或上传个人健康、生物或患者数据。",
  };
}
