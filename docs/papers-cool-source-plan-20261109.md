# Papers.cool AI 论文源接入优化

## 范围与证据

- `cs.AI/feed` 已在 `wrangler.toml` 的六个 Papers.cool 订阅中，且已注册到共享 `paper` 素材池；不重复添加订阅。
- 当前词表把 brain/cognition 等宽泛词和 AI 并列匹配，可能收进通用推理、脑启发算法或机器人论文。
- 聚合和日报选材优先图片；跨分类、papers.cool/arxiv、版本链接尚未统一论文身份。
- RSS 缺失日期会回填当前时间，无法区分原始发表与更新；现有日志只有过滤后的数量。
- 三个栏目复用素材池，但商机选材直接截取数组，缓存素材也应走同一相关性排序。

## 执行清单

- [x] 核实当前主分支、已有源和发布边界，创建独立工作分支。
- [x] 先补固定素材回归测试，复现误选、排序、日期与去重缺陷。首次 16 项测试中 4 项失败，符合预期。
- [x] 最小修改 RSS 计数、相关性排序、arXiv 身份去重及三栏选材。第一轮相关回归 62/62 通过，包含三栏的固定模型验证。
- [x] 固定模型/写入模拟验收，运行既有测试和本地 Worker 打包。
- [x] 有界只读 cs.AI 抓取，记录真实筛选结果与局限。首轮发现 Gene 编程隐喻误选，修复后再读一次；共两个单请求检查，此后使用缓存离线复验。

## 不变边界

不增加订阅、请求上限、素材上限、模型调用次数；不修改前端、模型配置、健康/来源发布门禁。不调用付费模型，不读取模型密钥，不写生产 KV、页面或 records。初次本地阶段不部署；用户后续明确授权推送并部署现有 Worker，但只做不付费状态检查，不手动触发生成。部署凭据只由现有环境提供，不打印或提交。论文相关性是编辑选材信号，不是疗效或科学可信度评级。缺少足够相关论文时不以泛 AI 论文凑数。

## 验收记录

### 修改清单

| 文件 | 变化 |
| --- | --- |
| `src/bioPaperSelection.js`（新增） | 共享选材规则：AI 延寿优先，其次 AI 生物方法、最后生物背景；直接生物工具优于外围医疗应用；统一 arXiv 身份。相关性不是科学可信度评级。 |
| `src/dataSources/longevity-rss.js` | 每订阅漏斗计数；先相关性/日期筛选、去重、排序再截取；跨订阅身份去重。缺失日期不回填今天；原发表时间与更新时间分开记录。只提供 updated 时明确标记原发表时间未知。保留显式自定义词表作为附加限制。单源错误不影响其他源；论文响应限制 2 MiB，非 RSS/Atom 记为错误而非正常空源。 |
| `src/dataFetchers.js` | 论文聚合先相关性排序和跨源去重，再执行原有类型上限；其他类型保持原排序。增加汇总计数。 |
| `src/dailyPromptSelection.js` | 论文按相关性优先；总预算紧张时给确实存在的 AI 生物论文最多预留两个位置，不扩大总预算或分类上限。补齐兜底分支对各分类上限的检查。 |
| `src/bioDailyMarkdown.js` | 日报最终论文资格与共享规则一致，排除通用认知/脑启发算法，不排除真实脑影像、生物方法。 |
| `src/handlers/scheduled.js` | 最近历史去重补充 arXiv 身份，不新增 KV 查询；两个商机栏目对缓存/预加载论文也执行排序和去重。三栏提示明确论文证据与日期边界，并记录选材计数。发布门禁与写入顺序不变。 |
| `scripts/check-papers-cool-source.mjs`（新增） | 单个 cs.AI 公共 RSS 只读检查，最多一请求；可保存结果及 RSS，支持不联网重放。不导入模型、GitHub 或 KV 模块。 |
| `tests/bioPaperSelection.test.mjs`（新增） | 生物对象、认知/机器人误选、Gene/遗传算法隐喻、仅展望提及生物用途、AI 工具优先级和 arXiv 身份。 |
| `tests/paperAggregation.test.mjs`（新增） | 固定多源素材验证真实聚合器的跨源去重、排序与类型上限。 |
| `tests/longevityRss.test.mjs` | 补日期、更新、计数、分类、限额、单源失败、响应大小/格式和显式词表限制的测试，保留新闻图片与社交 RSS 原测试。 |
| `tests/dailyPromptSelection.test.mjs` | 紧预算论文预留、版本去重、图片不得压过生物相关性、没有素材不制造论文。 |
| `tests/scheduledOpportunityGate.test.mjs` | 固定模型与模拟写入验证三栏选材、来源恢复到 records、日报预览零写入、版本/标题更改的历史去重；保留原健康与来源门禁回归。 |
| 本文（新增） | 方案、进度、差异与验收证据。 |

### 固定素材测试

在 `D:\GitHub\_worktrees\bioai-papers-source-20261109` 执行，使用 D 盘缓存包装器：

```powershell
& 'C:\Users\dongy\.codex\skills\project-cache-hygiene\scripts\Invoke-WithProjectCache.ps1' `
  -ProjectPath 'D:\GitHub\_worktrees\bioai-papers-source-20261109' `
  -Command @('node','--require','./tests/helpers/deny-network.cjs',
    '--test','--test-reporter=spec','tests/*.test.mjs','tests/*.test.js')
```

初次结果：**342 项通过，0 失败、0 跳过**。发布前复核另以红测复现 `cropped/cropping` 图像裁剪被 `crop\w*` 农业规则误删，改成仅匹配 `crop/crops` 后，**343 项全部通过**；农业专属研究仍排除。模型返回与 GitHub/KV 写入均用固定模拟；预加载器禁止真实 fetch。此为已获授权的本机开发验收，不是操作系统级网络/文件隔离。

Worker 检查使用本机已安装 Wrangler，无依赖安装：

```powershell
$env:WRANGLER_SEND_METRICS='false'
& 'C:\Users\dongy\.codex\skills\project-cache-hygiene\scripts\Invoke-WithProjectCache.ps1' `
  -ProjectPath 'D:\GitHub\_worktrees\bioai-papers-source-20261109' `
  -Command @('node','C:/Users/dongy/AppData/Roaming/npm/node_modules/wrangler/bin/wrangler.js',
    'deploy','--dry-run','--outdir','D:/CodexCache/artifacts/bioai-papers-source-20261109/worker-dist')
```

结果：本地打包成功，明确输出 `--dry-run: exiting now.`，没有上传或部署。测试仍提示父目录 package.json 未声明 module type；未为消除提示修改无关父目录或安装依赖。

### 实际公共订阅复验

检查时间：2026-11-09 北京时间，参考日期固定为 `2026-11-09`，7 天时间窗；每次仅抓 `https://papers.cool/arxiv/cs.AI/feed`，上限 10 条，与现有 Worker 每订阅预算一致。

最终漏斗：**198 篇 → 主题排除 181 篇 → 日期排除 1 篇 → 16 条候选 → 原上限保留 10 条**，本次无重复。16 条均只有来源更新时间，没有单独的原始发表时间，不能称作 11 月 9 日新发表论文。

前三条为 MUSS 单细胞基因调控、RIVER 酶反应证据检索、PharmAgents2 药物发现。实际摘要确认 LeNO 虽标题偏通用生成模型，但确有蛋白结构生成评测，因此没有仅凭标题删除。泛认知/机器人不再仅靠 brain/cognition 入选；Evolver 的 Gene 编程资产不算生物基因。

- [最终抓取结果](D:/CodexCache/artifacts/bioai-papers-source-20261109/cs-ai-readonly-final.json)
- [离线重放结果](D:/CodexCache/artifacts/bioai-papers-source-20261109/cs-ai-offline-replay.json)
- [全套测试日志](D:/CodexCache/artifacts/bioai-papers-source-20261109/offline-tests-final.log)
- [Worker 本地打包日志](D:/CodexCache/artifacts/bioai-papers-source-20261109/worker-dry-run-final.log)

之后重复检查优先重放已保存订阅，不再请求网站或模型：

```powershell
node --require ./tests/helpers/deny-network.cjs scripts/check-papers-cool-source.mjs `
  --input D:/CodexCache/artifacts/bioai-papers-source-20261109/cs-ai-readonly-final.json.atom `
  --date 2026-11-09
```

该命令也应放在上述 D 盘缓存包装器中执行。重放结果与最终抓取一致，外部请求为 0；本轮真实模型调用和生产内容写入均为 0。

### 尚未验证

本地验收阶段的修改位于 `codex/bioai-papers-source-20261109` 独立工作分支。后续用户已明确授权安全推送和部署，实际回执见下文；线上前端和历史文章不在本批修改范围。未调用真实模型，因此不声称已证明新的自动生成文案质量；16 条相关候选也不是 16 条科学突破或已验证疗效。

缓存收尾：包装器已清理各次命令的专属 TEMP/TMP。删除本次构建产生的 `D:\GitHub\_worktrees\bioai-papers-source-20261109\.wrangler\tmp` 被本机工具策略拒绝，未换命令或其他工具重试，保留该 D 盘临时目录；原有 `.wrangler/state` 和共享依赖缓存未清理。

上线后仍需观察实际 Worker 日志中的 `[papers-cool][funnel]`、`[paper][pool]`、`[paper][daily-selection]`、`[paper][opportunity-selection]`，并核对三栏页面、商机 records 和定时任务结果。历史去重沿用原缓存语义和时间窗，候选量不等于最终刊发量；周末/节假日无新增时不承诺每天十篇。当前启发式仍可能漏选或误选，需要根据这些计数与实际稿件调整，而不是放宽健康/来源门禁。

## 已授权上线步骤

- [x] 用户确认：授权推送并部署，仅做不付费状态检查。
- [x] SSH 只读更新后确认基线 `12293852c652d569c6b175073994e0900e196d5e`，没有分叉；原始工作区及无关改动未合并。
- [x] 核对现用 Cloudflare 账号 `e463a2527ad0aabaa97379e675219f82`、Worker `cloudflare-bioai-daily`、绑定 DATA_KV。上线前生产版本 `b1374a39-9d17-452e-8fc4-3b6cf0271f49`，41 个绑定包含 7 个 Secret，三个 cron 保持原样。
- [x] 最终离线回归 343/343 通过，未调用模型。
- [x] 提交和正常快进推送本批 13 个文件，核对自动 CI。
- [x] 从生产元数据构建临时发布配置，upload 后比对绑定和运行兼容性，确认未切流后再 deploy；未执行 triggers deploy。
- [x] 回读 100% 生产版本、绑定、cron 和无需密钥的只读接口，核对内容仓库未被本轮改写。

发布前后的完整元数据与日志只保留在 `D:/CodexCache/artifacts/bioai-papers-source-20261109/`。不把临时发布配置、公共 RSS 原文、日志、凭据或模型费用预览加入 Git。

### 正式发布回执

- 代码提交：[3a98d9df88e5fa69a463de2ce6e292205cdf253c](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/commit/3a98d9df88e5fa69a463de2ce6e292205cdf253c)。SSH 正常快进推送至 `main`，未强推，未改原始工作区分支。
- 推送自然触发的 [Opportunity Records CI 42533795832](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/actions/runs/42533795832) 已完成，结论 `success`；没有手动重跑 CI 或自愈流程。
- 发布前以最终代码重放已保存的真实 cs.AI 订阅，结果仍是 198 → 16 → 10，外部请求 0。`cropped/cropping` 修复没有改变这一批素材的筛选结果。
- 生产元数据生成的临时配置本地打包成功；通过 `versions upload` 上传，tag 为 `papers-bioai-3a98d9df`，新版本 `57a651a8-cc0b-46c8-b40d-65f9097564a2`。
- 上传后切流前确认旧版本仍占 100%，新版本的 41 个绑定、7 个 Secret 名称及运行设置与旧版本完全一致。随后 `versions deploy ...@100` 正常切流，CLI 明确 `No non-versioned settings to sync`；没有部署或改写 triggers。
- 正式部署 ID `c2d56297-3873-4577-b638-7db00b120728`；Cloudflare 时间 `2026-11-08T23:11:59.252246Z`，即北京时间 **2026-11-09 07:11:59**。发布后 API 回读确认新版本占 100%，绑定、运行兼容设置、三个 cron 原样保留。
- 保留回滚版本 `b1374a39-9d17-452e-8fc4-3b6cf0271f49`，本轮没有执行回滚。后续回滚只针对本次 Worker 代码，不修改历史文章、KV 或其他项目。
- 线上非生成检查：`GET /login` HTTP 200 且有登录表单；不带密钥请求 `/testTriggerScheduled`、`/testTriggerScheduledOpportunity?mode=opportunity`、`/testTriggerScheduledProjectOpportunity` 均为 HTTP 401 且返回 `Unauthorized`。没有发送有效触发密钥、没有调用 `/testModelConnection`，没有执行生成链路。
- `BioAI-Daily-Web` 发布前后 HEAD 均为 `7bb0a96aa37274c0515c2b1c456f676da551f37a`，没有修改或发布前端及历史内容。

发布证据：`release-tests.log`、`release.patch`、`release-source-replay.json`、`release-build.log`、`worker-upload.log`、`worker-deploy.log`、`BeforeDeploy.json`、`AfterDeploy.json`、`live-status.json`，均在上述 D 盘产物目录。生产配置快照只包含服务端可见的普通配置和 Secret 名称，无 Secret 值，未加入 Git。

**验收边界**：此次证明代码已上线、原配置保持、入口及鉴权正常；HTTP 401 是鉴权检查成功，不是生成成功。没有在本轮调用付费模型、手动生成日报或写 records，不能据此宣布三份新日报已经生成。实际定时生成的文章质量、来源分布及连续跨日运行，仍需下一次真实任务的日志、Markdown 与 records 共同确认。
