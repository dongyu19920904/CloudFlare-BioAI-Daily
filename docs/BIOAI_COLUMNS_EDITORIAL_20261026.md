# 三个栏目编辑与排版离线改进

## 状态与范围

- [x] 同步后端 main `265b7b07`，保留已部署的个人博客与 opportunity 门禁修复。
- [x] 核实前端 remote 与干净工作区；主目录的分叉及未提交修改未动。
- [x] 阅读三个栏目当前 prompt、定时生成/保存链路和真实样稿。
- [x] 固定素材、模型返回、保存模拟及格式保真测试。
- [x] 版本化栏目规则接入真实请求；确定性排版接入保存前。
- [x] 仅三个正文容器的样式、Hugo 渲染及手机/桌面日夜检查。
- [x] 回归、成本变化和交接记录；本地提交回执见产物目录 `HANDOFF.md`。

本轮不推送、不独立部署 Worker，不触发生产生成，不批量改历史正文。个人博客由其他任务负责；不修改 blog prompt/质量/handler/作者资料、共享 transport、入口、cron 或 Secrets。用户已明确允许本机离线 mock 测试、Hugo 构建和浏览器验收；不将此环境称为操作系统级安全沙箱。

## 工作区与实际栏目

后端：`D:\GitHub\_worktrees\bioai-opportunity-gate-20261026`，前端：`D:\GitHub\BioAI-Daily-Web-structure-20261015`；两仓库均使用新分支 `codex/bioai-columns-editorial-20261026`。前端基线 `bd056cdc`，仓库 `dongyu19920904/BioAI-Daily-Web`，Hugo/Hextra v0.11.1。

| 栏目原名 | mode / 手动入口 | 当前写入与用途 |
| --- | --- | --- |
| AI生命延续学日报 | daily / `/testTriggerScheduled` | `daily/DATE.md`、`content/cn/YYYY-MM/DATE.md`；研究事实、概念与证据阶段，不写售卖方案。 |
| AI生命延续学商机日报 | opportunity / `/testTriggerScheduledOpportunity?mode=opportunity` | `content/cn/opportunity/YYYY-MM/DATE.md` 与该栏目 records；目标人群、需求证据、验证动作、成本风险。 |
| AI生命延续学资讯商机项目 | project-opportunity / `/testTriggerScheduledProjectOpportunity` | `content/cn/project-opportunity/YYYY-MM/DATE.md` 与该栏目 records；由资讯发现项目线索，区分已知功能与编辑推断，核查数据、许可证和试跑条件。 |

三个栏目继续使用原名称、栏目路径、Frontmatter、日期和 records 解析字段，不将“资讯商机项目”擅自合并为普通商机。opportunity alias 不带 mode 时仍是 batch，离线测试锁定这一契约。

## 当前问题与链路

日报：scheduled -> 现有抓取/去重/筛选 -> 正文请求 -> 来源检查 -> 三行摘要请求 -> 合并/去重 -> unsafe 检查 -> raw/page/月目录/首页。手动正文入口复用相同的正文 prompt 和组稿函数。

两个商机：scheduled -> 现有抓取或共用输入 -> 选材上限/格式化 -> 一次生成 -> 来源与健康门禁 -> 最多一次定向 repair -> records -> page/月目录/首页。格式调整必须在获准稿基础上做；失败不能使没有合格稿的任务变成功。

Hugo：GitHub Markdown -> Goldmark -> 既有 Hextra 模板 -> `bioai-reader.css`。无需再引入 Markdown-to-HTML 渲染器。

发现：

1. 商机素材的项目日期统一标成 `Published`，而 GitHub fetcher 提供的是最近活跃时间。真实 10-26 项目稿据此出现“发布”说法，必须修正输入标签，而不是只改样式。
2. 真实 10-24 商机稿将“中文覆盖少”“愿意付费”写成确定事实，并把点赞等兴趣信号视为付费验证。没有需求素材时应明确是假设，指标也只能是建议阈值。
3. 真实 10-26 项目稿出现“唯一可立即试跑”和具体 GPU/许可条件；输入没有 README 或许可证信息时不能补成已验证条件。
4. 真实 10-26 日报个别段落同时堆多个机制、样本和缩写；应保留核心概念及必要证据，不再加一轮全文改写或按字数截断。媒体链接不能标为公司原始公告。
5. 当前前端已有克制的 Hextra 阅读层，不重做主题。新增样式只处理三个栏目正文中的列表、表格、长代码/公式和段落节奏，不能改全站根颜色或其他模块。

## 选型

| 候选 | 决定与理由 |
| --- | --- |
| AgriciDaniel/claude-blog | 主流程借鉴：先辨证据、再编辑、再核对保护信息。使用本机固定快照 `354442348815a7f0327077ad89af2c43cf4b4ab4`（MIT），已读 README、factcheck Skill、许可证与 requirements.lock；不把 Python/NLP、100 分评分或 SEO 长文流程搬进 Worker。中文分数不是本轮质量标准。 |
| ComposioHQ/content-research-writer | 已有替代：claude-blog 加现有来源门禁已覆盖研究/引用流程，不叠第二个调度器。未采用其代码或运行依赖。 |
| coreyhaines31/marketingskills | 仅商机规则借鉴：customer-research 的需求证据与假设分离。固定 `e85f3cbc2e4a79bf33b2a12e9bdd9087d414735b`（MIT）；只读取方法，不开展实际访谈、抓取社群或收费活动。 |
| op7418/Humanizer-zh | 唯一润色参考：固定 `f4518a8eab97b8bfebc66a89d34320a89bef6930`（MIT）；已读 README 与完整 SKILL。保留条件、否定、归因、确定程度和受保护内容，不承诺 AI 检测结果。其余两个 Humanizer/stop-slop 不叠加。 |
| baoyu-format-markdown | 借鉴“只排版不改内容”，固定 baoyu-skills `1567581c26ec29f4216c6e6835415bf30343b0e3`（MIT）。Skill 的脚本需要 Bun/npx、CJK 自动修正且会动 YAML，不适合本 Worker；不安装执行，仅自写极小的空行整理并做保真与回退。 |
| baoyu-markdown-to-html | 已有替代：Hugo Goldmark/Hextra 已负责渲染，不新增 HTML 生成器。 |
| tailwindcss-typography / heti / github-markdown-css / doocs/md | 已有替代或不适用：只沿用当前 Hextra 阅读层；不叠多个 CSS reset、编辑器或外部全站样式。 |
| markdownlint | 方法借鉴：保留标题边界和围栏完整性；不新增运行依赖，不开启会批量改标题/列表/代码的自动修复。 |

上游链接和 pin 只用于开发时方法参考，不在每天任务中拉取。新增 Worker 逻辑为本地 JS，无新包管理器、锁文件、服务或模型调用。上述规则将写成可追溯的栏目版本，不把开发机 Skill 当成 Worker 会自动读取的配置。

来源定位：本机 [claude-blog](https://github.com/AgriciDaniel/claude-blog/tree/354442348815a7f0327077ad89af2c43cf4b4ab4)、[customer-research](https://github.com/coreyhaines31/marketingskills/tree/e85f3cbc2e4a79bf33b2a12e9bdd9087d414735b/skills/customer-research)、[Humanizer-zh](https://github.com/op7418/Humanizer-zh/tree/f4518a8eab97b8bfebc66a89d34320a89bef6930)、[baoyu-format-markdown](https://github.com/JimLiu/baoyu-skills/tree/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-format-markdown)。选中方法的 README/安装约束、Skill 和 MIT 许可证已核对；仅借鉴流程和原则，未复制上游运行代码或安装脚本，不引入这些仓库的运行依赖。README 中安装、删除、发布命令没有执行。

## 实施原则

- 用一个版本化编辑规则模块区分三个栏目的证据/需求/试跑职责，接入现有 system prompt，而不是只写文档。
- 确定性格式层只增加安全位置的空行；URL、数字、限定句、Markdown 文本、代码/公式、Frontmatter 保持原值，不做中文引号或全角字符替换。
- 先检查原稿资格，再尝试格式化并复核保护内容；格式化失败回到原合格稿，没有合格稿直接失败。轻度长段落等仅发规则码，不新增模型调用。健康/来源严重失败仍沿用已有有界定向 repair。
- 固定 fixtures 是测试材料，不冒充真实研究或实际用户需求，不发布。真实历史样稿只作阅读诊断，不重写。

## 实际改动与失败行为

- `src/prompt/bioReportEditorial.js`：`bioai-columns/2026-10-26.1`，实际进入三个栏目 system prompt，分别约束研究解释、需求假设、项目可运行条件；不改原栏目结构、名称和 records 字段。
- `src/handlers/scheduled.js`：两类商机项目素材日期改为最近活跃（非创建/发布）；未知 README/许可/试跑条件明确待核查；排版层放在合格正文之后、records/page/index 之前。三个成功结果增加不含正文的 `presentation` 版本/状态/告警元数据。
- `src/bioReportPresentation.js`：只在安全的标题边界插空行；验证所有非空内容行以及围栏代码、缩进代码、原始 HTML、公式块、Frontmatter 的保护快照。URL 或数字内插换行也回退，不能用“只改换行”绕过保真。
- 轻度长段落仅返回最多 10 个规则码/行号，不增加调用。格式器抛错、改字或复验失败，回到已合格原稿；原稿不合格时抛错，不能借回退放行。
- `src/opportunitySourceGate.js`：未闭合围栏/公式/元信息成为严重格式错误，诊断含规则码和行号；两个商机沿用最多两次的定向纠正，不加新轮次。健康、真实来源和 DOI 规则保持原策略，健康劝阻句仍保守拦截。
- 日报已有来源校验、组稿和安全检查保留。日报未闭合正文阻断发布，不额外引入 repair。所有测试中的阻断均为页面、records、索引写入零；抓取缓存与发布写入不是同一概念。
- 前端只加 `report-kind` 分类、正文属性和指纹化 CSS，不改 canonical、schema、正文文件、导航业务或全站根配色。列表间距、48rem 阅读宽度及表格/代码/公式容器溢出规则仅三栏正文启用。长表格保留可读列宽，手机局部滚动，不挤成竖排。

## 离线结果与成本

固定完整链路使用实际 scheduled、门禁、records 解析和页面构造；只模拟模型、素材抓取和 GitHub I/O。素材是 `example.org` 上的明确虚构测试资料，不是实际研究验证。

| 栏目 | 固定输入数 | 实际 records 数 | 模型模拟调用 | 发布模拟写入 |
| --- | --- | --- | --- | --- |
| daily | 2 | 不适用 | 2（正文 + 三行摘要） | 4（raw/page/month/home） |
| opportunity | 2 | 1 | 1 | 4（records/page/month/section） |
| project-opportunity | 2 | 1 | 1 | 4（records/page/month/section） |

与原正常流程相比，三栏新增模型调用均为 **0**，抓取数量/请求上限不变，模型路由及输出 token 上限不变。三个 system prompt 按同一日期的字符数从 6143/2983/2889 变为 6556/3461/3382（分别 +413/+478/+493）；商机每条输入还增加短证据边界。字符数不是 token 或金额，本轮未发真实模型请求，不能声称线上费用完全不变或质量已实测提升。修复/润色不新增模型阶段；健康/来源/严重格式失败仍受已有两次预算约束，底层既有模型线路容错未重构。

- 后端最新全量：293 项，通过；前端：33 项，通过。新增保真、栏目规则和完整保存链路测试；保留所有旧测试断言。
- Hugo 0.147.9 完整构建：中文 896、英文 984 页，通过；来源说明/Article schema 三类历史页通过，时间线 14 期/27 节点/27 个唯一来源通过。本机该完整构建耗时约 699 秒，不能当成线上性能基准。最后一次表格列宽微调后另构建当前样稿 21 页并复验，避免再次重复全历史构建。
- Playwright 现有 Chromium 151.0.7922.34：三栏 × 1440×1000 / 390×844 × 日夜共 12 组；再加 2 组代码/表格/公式容器 DOM 压力夹具。实际 PNG 宽高一致、单 H1、来源链接和 canonical 保留、原生主题切换不重载/不改正文、无页面横向溢出、无 pageerror。
- 正文日间对比度约 10.69:1，链接约 5.45:1；夜间约 12.87:1 / 10.01:1。只验证此配色下正文与链接，不宣称完整 WCAG 或医学意义“护眼认证”。
- 手机压力夹具：表格宽 358 / 内容宽 756，代码宽 358 / 内容宽 713，均局部滚动；公式测试为容器检查，不是新增 KaTeX 渲染器验收。

浏览器说明：内嵌 neo 工具首次 120 秒超时；按专用浏览器文档通过官方 MCP SDK 新连接回读成功，但其背景页截图前的视口/渲染等待失败，不能作为验收。已关闭本连接创建的测试页，未接管旧页、重启共享浏览器或清登录态。最终用本机已有 Playwright 的独立无凭据上下文，仅允许 loopback 请求，无新安装，关闭上下文及浏览器后写出结果。

## 复现与产物

后端固定测试/导出（PowerShell，所有命令套 `Invoke-WithProjectCache.ps1`，具体命令数组见下）：

```powershell
$env:BIOAI_FIXTURE_OUTPUT_DIR = 'D:\CodexCache\artifacts\bioai-columns-editorial-20261026'
# ProjectPath = D:\GitHub\_worktrees\bioai-opportunity-gate-20261026
# -Command @('node','--require','./tests/helpers/deny-network.cjs','--test','tests/*.test.mjs','tests/*.test.js')
```

前端 `node --test tests/*.test.cjs`；Hugo 使用已安装的 `D:\CodexCache\tools\hugo-0.147.9\hugo.exe`，配置 `hugo.yaml` 加产物目录 `full-config.json` 或 `fixture-config.json`，`GOPROXY=off`、`GOSUMDB=off`。资源、输出、缓存均在 D 盘。浏览器命令 `node scripts/check-columns-offline.mjs http://127.0.0.1:1337/ D:/CodexCache/artifacts/bioai-columns-editorial-20261026/browser`，依赖本机既有 Playwright；它不是 Worker 或 Pages 的运行依赖。供预览的临时静态服务绑定 loopback，并以 CSP 阻止外部脚本、统计、fetch、图片和 iframe。

保留产物根：`D:\CodexCache\artifacts\bioai-columns-editorial-20261026`：

- `drafts/*.md`：原始模型固定返回；`generated/daily/2026-10-26.md` 及 `generated/content/cn/...`：实际保存模拟输出，包含日期/Frontmatter。
- `generated/static/data/opportunities/{opportunity,project-opportunity}/2026-10-26.json`：实际解析 records；`results/*.json`：输入选择数、输出数量、调用及写入路径。
- `fixture-site/`：Hugo 样稿渲染；`full-site/`：完整构建；均不是线上发布。
- `browser/report.json`、12 张三栏日夜截图、2 张容器压力图；另 6 张 `columns-disabled` 图仅为同一固定正文关闭新增 CSS 的对照，不是旧模型与新模型质量 A/B。
- `serve.mjs`、`fixture-config.json`、`full-config.json`：本次离线复现配置。失败的 `capture.mjs` 留作 neo 超时定位证据，不作为通过记录。

## 尚存边界与统一整合

1. 未调用真实模型/生产接口，无法验证下一期真实生成的措辞质量、实时源可用性、运行时额度或付费金额；本轮结果是确定性保真和 mock 链路验收，不是实际医学审查或需求验证。
2. 旧手动编辑 UI 的 `genAIContent`/commit helper 仍有全局中英文引号转换，本轮未改共享 helper。三栏 scheduled/test-trigger 保存路径已覆盖，不能把它扩大成所有手动编辑路径的完整字符保真承诺。
3. 保留原文的现有科学门禁不能自动证明研究事实或付费意愿；新增规则是 prompt 约束，不是完整语义审稿器。没有真实来源或证据时继续阻断/待核，不用“空报告”掩盖风险主推。
4. 后端基于 `265b7b07`，前端基于 `bd056cdc`，不含协调任务 A 的个人博客新提交 `4e858c82`；本分支不碰其所有权文件。统一整合必须保留 A 的修改，不能独立用旧部署版本覆盖共享 Worker。
5. 两个分支只保留本地提交；未推送、未部署、未重跑 Actions、未修改线上内容。最终 commit 与路径另记交接单。发布后的三接口需同 date、`sync=1`；商机入口必须 `mode=opportunity`。实际 `src/index.js` 当前只接受 `key` 查询参数，不支持密钥请求头；本轮不改认证路由。验收脚本应从进程环境读取密钥、在内存构造请求，不输出完整 URL、不写终端历史或浏览器地址栏，禁用请求 URL 日志并避免分享链接。检查 HTTP + `result.success` + 实际页面/records + `presentation`，不能只看 `selectedCount`。查询参数仍有上游访问日志泄露风险；若需支持请求头，应另行审查入口并补认证测试，不能把尚未实现的方式写成可用。
