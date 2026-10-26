# Opportunity 自动生成门禁修复（2026-10-26，本地验证）

## 范围与证据

- 后端：`dongyu19920904/CloudFlare-BioAI-Daily`；内容目标：`dongyu19920904/BioAI-Daily-Web`。
- 基线：远端 main `c7e78e557872b1d7aae01e3fbc7abcd428bd90e2`。
- 修复工作区：`D:\GitHub\_worktrees\bioai-opportunity-gate-20261026`，分支 `codex/bioai-opportunity-gate-20261026`。
- 原始工作区存在其他分支及未提交修改，未改动、覆盖或合并这些内容。本次修复整理为上述独立分支的一次本地提交；未推送。
- 已查阅当前任务 AGENTS.md、PROJECT_CHARTER.md、相关维护/测试规范；目标仓库与相关父目录未发现额外 AGENTS.md。
- 已只读检查 [Issue #72](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/issues/72) 和 [Issue #73](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/issues/73)。
- 本轮未部署、未触发线上生成、未运行 GitHub Actions、未修改线上内容，测试未调用付费模型。

## 根因与证据边界

1. 可复现：原 records 提取器仅因“自测”等词产生 `health_claim_review`，门禁再用该标记判定健康风险，造成技术自测的循环误判。整篇健康语境也会污染无关技术检查。
2. 可复现：第二轮仅获得原素材与通用纠正要求，没有第一轮失败草稿、命中章节或句子，不能定向修订。原有总计两轮的预算不变。
3. 可复现：records 对 DOI 解析器别名、编码和路径大小写进行规范化，输入白名单未采用相同实现，同一 DOI 可能误报不在输入中。
4. 另发现：原来源检查只要求有一个合法 URL，同一条“证据来源”夹带一个编造 URL 仍能通过，现已收紧。
5. #73 的直接阻断是健康门禁：已提取候选，缺链接数为 0；不是 `no_items`。但未取得当时失败草稿，不能断言具体命中劝阻句、软件自测或哪一行。这些是已复现的实现缺陷，不是历史命中句的证明。
6. #72 是三个模块均无输入素材的独立故障；本次不重构抓取系统，不能声称修复了该历史素材中断。

## 行为与文件变更

| 文件 | 变更 |
| --- | --- |
| `src/opportunitySourceGate.js` | 按章节/段落/句子定位风险，不依赖 records 风险标记；识别明确技术检查对象；共享来源规范化；增加脱敏诊断及带失败草稿的定向纠正。 |
| `src/opportunityRecords.js` | 导出共用 URL 规范化/提取函数；自测词本身不再产生医疗审核标记，现有真实医疗词标记保留。 |
| `src/handlers/scheduled.js` | 两个商机 handler 的失败结果增加 `gate_diagnostics`；失败保持 `success:false`，不记录整份失败草稿。 |
| `src/prompt/bioOpportunityPrompt.js` | 明确技术检查与个人健康判断边界；将风险建议改写为研究来源、证据阶段、局限；明确空主推不是成功。 |
| `.github/workflows/daily-self-heal.yml` | HTTP 2xx 后还必须验证顶层及 `result.success`、同步完成、同一日期和正确 mode，避免虚假自愈。未更改触发频率或重试次数。 |
| `tests/opportunitySourceGate.test.mjs` | 来源、DOI、技术自检、个人诊断、非主推风险、劝阻句、重试定向反馈、白名单隔离及日志脱敏测试。 |
| `tests/opportunityRecords.test.mjs` | 技术自测不再自动生成医疗审核标记的回归测试。 |
| `tests/scheduledOpportunityGate.test.mjs` | 使用真实 scheduled、门禁、records 和页面构建逻辑，模拟模型、素材和 GitHub I/O，验证写入边界及失败传播。 |
| `tests/manualScheduledMode.test.mjs` | 锁定 opportunity alias 必须显式 mode，否则进入 batch；daily/project 路由不变。生产路由代码无需修改。 |
| `tests/dailySelfHealContract.test.mjs` | 检查 workflow 成功判据、统一 date/sync/密钥参数与明确的 opportunity mode；这是结构测试，不是执行 Actions/jq。 |
| `tests/helpers/deny-network.cjs` | 默认禁止测试中的真实 fetch；请求须显式替换为固定模拟返回。 |
| 本文档 | 根因、行为、离线测试及后续验收方法。 |

### 安全策略

- 仍扫描所有章节，不仅扫描“今日主推”；未经验证的个人健康自测、诊断产品和疾病风险评分建议仍被阻断。
- **保留原有保守劝阻句策略**：“不要制作健康自测清单”仍被拦截；不存在“含不要就放行”。重试将其改写为研究来源、证据阶段与局限，而非仅删词或加免责声明。
- “工具安装自测”“软件自检”及明确的系统故障诊断可通过；技术用语不能豁免同句中的个人疾病评分或诊断输出。判断基于明确检查对象，不是含“软件”就放行；“免疫功能自测”“身体性能自检”和含糊的个人健康工具自测不属于技术例外。
- 每轮诊断包含轮次、提取数量、来源问题条目、健康命中章节/标题/行号及短句；每类最多列 5 条，短句最长 160 字符。隐藏 URL、邮箱、常见密钥/令牌与手机号；失败草稿不写日志、响应或 GitHub。
- 第二轮获得第一轮草稿（最多 16000 字符）、具体命中位置和修改要求；只保留原始素材白名单，失败草稿中的 URL 不能进入白名单。总计最多两轮编辑生成，未增加盲目重试；原有传输层 fallback 保持不变。
- 来源提取与白名单统一调用同一规范化实现。每条主推的证据来源必须非空且全部属于输入；普通 URL 路径大小写仍有意义，只有 DOI 按原规则统一。不得编造 DOI 或使用无关来源补字段。
- 门禁通过前，records、页面、月索引和首页写入均为零。第二轮通过才发布；两轮失败返回失败。模拟 records 写入失败时不会继续写页面/索引。

### “无合格主推”契约

opportunity 原提示词允许写“未筛出合格主推”，但解析器只接受实际 `###` 主推条目，结果为 `no_main_items`。本次明确它表示未发布，**不新增空报告成功路径**。

project-opportunity 原有透明空项目状态 `no_qualifying_project` 保留：无命名主推时，已有的确定性安全空状态可替换不安全附带建议并重新检查，不再额外调用模型；有命名风险主推时不能走此路径，仍须纠正或失败。空状态不表示发现了可做项目。

## 测试与结果

遵循先复现再修复：新增门禁测试在修复前出现 9 项失败；真实 scheduled 模拟链路也复现定向重试及诊断缺口。最后补入明确系统故障诊断用例，先观察失败再修复技术对象边界。

环境：Node.js v24.16.0。最终命令（PowerShell，在上述修复工作区）：

```powershell
& 'C:\Users\dongy\.codex\skills\project-cache-hygiene\scripts\Invoke-WithProjectCache.ps1' `
  -ProjectPath 'D:\GitHub\_worktrees\bioai-opportunity-gate-20261026' `
  -Command @('node','--require','./tests/helpers/deny-network.cjs','--test','tests/*.test.mjs','tests/*.test.js')
git diff --check
```

全套现有及新增测试：**261 项通过，0 失败，0 跳过**，最终一轮约 13.15 秒。`git diff --check` 通过。

覆盖：有来源研究整理通过；有来源的个人健康自测失败；软件安装自检通过；非主推危险建议失败；劝阻句保守拦截；同一 DOI 不因大小写/别名/编码误判；缺失、编造、混入的来源失败；二轮定向修正后才写入；两轮失败零写入；daily 既有生成/排版测试、实际 handler 无素材契约和 project 发布路径回归。

Node 会提示仓库未声明 ESM 类型，这是原有模块布局告警，不是测试失败。本次没有为消除告警修改父目录 package.json。

## 后续部署后验收（本轮未执行）

以下操作会生成并写入内容，须在另行授权部署后执行，不属于上述离线测试。

三个请求使用**相同 date**（例如 `2026-10-26`），均用 `sync=1`，密钥通过内存中的 `key` 参数传入。当前接口只实现 query key，不能假设支持 Bearer。不要把含 key 的完整 URL 粘贴到浏览器、终端历史或日志。

| 模块 | 接口与额外参数 |
| --- | --- |
| daily | `/testTriggerScheduled?date=2026-10-26&sync=1` |
| opportunity | `/testTriggerScheduledOpportunity?date=2026-10-26&sync=1&mode=opportunity`，必须显式 mode，避免 batch |
| project-opportunity | `/testTriggerScheduledProjectOpportunity?date=2026-10-26&sync=1` |

安全调用示例（**仅作后续验收说明，本轮未运行**）：确认已部署正确版本及目标仓库后，在 PowerShell 安全输入密钥。Node 从进程环境读取，不打印密钥、完整 URL 或原始失败响应。

```powershell
$env:BIOAI_ACCEPTANCE_BASE_URL = 'https://cloudflare-bioai-daily.sabrinamisan090.workers.dev'
$env:BIOAI_ACCEPTANCE_DATE = '2026-10-26'
$previousSecret = $env:TEST_TRIGGER_SECRET
$secret = Read-Host 'TEST_TRIGGER_SECRET' -AsSecureString
try {
  $env:TEST_TRIGGER_SECRET = [System.Net.NetworkCredential]::new('', $secret).Password
  @'
const date = process.env.BIOAI_ACCEPTANCE_DATE;
const key = process.env.TEST_TRIGGER_SECRET;
if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Missing secret or invalid date');
const targets = [
  ['daily', '/testTriggerScheduled'],
  ['opportunity', '/testTriggerScheduledOpportunity'],
  ['project-opportunity', '/testTriggerScheduledProjectOpportunity'],
];
for (const [mode, path] of targets) {
  try {
    const url = new URL(path, process.env.BIOAI_ACCEPTANCE_BASE_URL);
    url.searchParams.set('key', key);
    url.searchParams.set('date', date);
    url.searchParams.set('sync', '1');
    if (mode === 'opportunity') url.searchParams.set('mode', 'opportunity');
    const response = await fetch(url, { signal: AbortSignal.timeout(900000) });
    const body = await response.json();
    const ok = response.ok && body.success === true && body.result?.success === true
      && body.async === false && body.date === date && body.result.date === date && body.mode === mode;
    console.log(JSON.stringify({ mode, date, http: response.status, ok,
      selectedCount: body.result?.selectedCount, recordsCount: body.result?.records?.count,
      gateDiagnostics: body.result?.gate_diagnostics }));
    if (!ok) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ mode, date, ok: false, error: 'Request failed; inspect sanitized Worker logs' }));
    process.exitCode = 1;
  }
}
'@ | node
} finally {
  $env:TEST_TRIGGER_SECRET = $previousSecret
  $secret.Dispose()
}
```

密钥只暂存在当前进程环境/内存，不写入配置或提交。不要启用请求调试输出；query key 仍可能出现在基础设施访问日志，访问权限及脱敏由部署环境控制。

### 验证真实发布产物

成功必须同时满足 HTTP 2xx、顶层 `success:true`、`result.success:true`、`async:false`、正确 date/mode，随后只读检查 `BioAI-Daily-Web` 默认发布分支的实际文件与提交版本：

- daily：`daily/2026-10-26.md` 和 `content/cn/2026-10/2026-10-26.md`；检查正文日期和内容、首页/月目录。daily 没有本次商机 records sidecar，不能误要求它生成商机记录。
- opportunity：`content/cn/opportunity/2026-10/2026-10-26.md` 以及 `static/data/opportunities/opportunity/2026-10-26.json`。
- project-opportunity：`content/cn/project-opportunity/2026-10/2026-10-26.md` 以及 `static/data/opportunities/project-opportunity/2026-10-26.json`。
- 两个商机对应的月索引 `content/cn/<section>/2026-10/_index.md` 和首页 `content/cn/<section>/_index.md` 必须正确引用新日期与路径。
- 两份 records 的 `report_date`、`report_section`、`source_page` 与请求一致，`opportunities.length` 等于各自 `result.records.count`，并逐条检查真实主推和来源。opportunity 正常发布应有实际记录；project 的合法空日须明确为 `no_qualifying_project`，不得解读为找到项目。
- `selectedCount` 只是输入素材数，不代表输出主推数量；HTTP 200、旧文件存在或 raw HEAD 成功也不足以确认本次生成。须比较提交版本、目标日期正文、来源和 records。
- 前端部署完成后再查看对应公开页面：`/2026-10/2026-10-26/`、`/opportunity/2026-10/2026-10-26/`、`/project-opportunity/2026-10/2026-10-26/`；排除旧缓存，确认正文与仓库版本一致。
- Worker 日志关注 `[OpportunityGate]` 的 attempt、extracted_count、missing_source_items、health_hits；区分素材为空、来源失败、健康门禁和写入/超时错误。不要为验证失败零写入而在线构造危险生成；该边界已用模拟测试验证。

## 剩余风险与未验证项

- 本次没有调用真实模型，因此尚未实证新版提示词在生产模型上每次都能二轮纠正成功；失败仍应明确返回并告警，不能承诺每天一定有合格素材。
- 健康判断仍是保守规则，不是医疗语义验证器；复杂或含糊措辞可能被拦截或未覆盖，应依据新增脱敏定位扩充固定测试，不能关闭门禁。
- 白名单保证链接来自输入，不证明论文有效性、链接与主张语义对应、临床有效性或商业可行性；科学核验状态仍保持未验证。
- 门禁前零写入不等于 GitHub 多文件事务。通过门禁后，后续页面写入若失败，可能留下已写 records，仍返回失败；本次不重构发布事务。
- Actions 修改只做了结构回归测试；本机未执行 jq 或 Actions。需后续授权部署及运行环境验证，当前未重跑任何线上流程。
- `docs/SELF_HEAL_GUARD.md` 是历史旧说明，包含过时的 cron/默认密钥描述；当前行为以代码和本文为准，本次未扩大为全面文档重写。

## 下一步交付记录

- 后续“进行下一步”先完成本地发布前复核与安全提交，不将其解释为撤销先前的部署、线上生成或 Actions 限制。外部操作范围已单独询问，未收到明确确认前不执行。
- 源码复核范围：来源白名单不可由失败草稿扩展；个人健康判断不因软件词或否定词放行；门禁前没有发布写入；新增诊断有脱敏与长度/条数上限；未增加定时任务和生成轮数。
- 本轮不修改运行代码或测试，仅更新本文并整理本地提交，因此复用上一轮 261 项测试通过的结果，未声称本轮重新运行。
- 按新增 `C:/Users/dongy/.codex/skills/security-audit/SKILL.md` guidance 模式进行静态复核；其 Universal execution safety 要求的操作系统级禁网、只读源代码/工具链、白名单环境及资源限制未在本机验证齐全，故本轮不执行目标代码，也不以 fetch mock 代替 OS 沙箱。本记录不是完整安全审计或动态验证通过证明。
- 提交前检查 Git hooks 配置及 hooks 目录，只有未启用的 `.sample` 示例；仅暂存本次修复、测试与本文。通过 `git diff --cached --check` 后提交，提交后确认工作区状态及文件清单。
