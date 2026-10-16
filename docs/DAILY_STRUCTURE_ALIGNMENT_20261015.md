# BioAI 日报结构对齐 AI 日报

## 最终发布与验收

2026-10-16 已完成普通中文日报的结构修改、真实模型预览、发布和线上检查。没有改 AI 日报项目、两个商机栏目的内容模板或其他项目。

- 后端 [PR #60](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/pull/60) 已合并至 main：`78fa32d34d51d2247301b2158c9a4d99bf98fcfc`。
- 后续图片解析兼容 [PR #61](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/pull/61) 也已合并：`c2cc071b49e8a7637041ef72bb0ab5401e67470f`。只修正带链接图片的标签解析，避免后续文章复用漏图，不修改正文或提示词。
- 前端 [PR #6](https://github.com/dongyu19920904/BioAI-Daily-Web/pull/6) 和同步清理 [PR #7](https://github.com/dongyu19920904/BioAI-Daily-Web/pull/7) 已合并至 main，最后代码提交 `66a40a6c4217e0b9ff6716c434e11b59dcb22231`。
- 最终生产 Worker 版本 `9803a744-6dc2-4510-8c48-b31f5b0ec866` 已承接 100% 流量。上一结构版本为 `d9a24439-8fe1-4d4d-9ac9-3d1b29830a2c`。两次均由线上 API 确认；最终版本登录页 200，缺少密钥的预览入口 401。没有将模型 Secret 导出到本地或输出到日志。
- 原 Cron 完全保留：UTC `20 11 * * *`、`30 11 * * *`、`30 12 * * *`，普通日报仍为北京时间每天 19:20。不新增日常模型轮次或定时任务。
- 正式同步 [38896325484](https://github.com/dongyu19920904/BioAI-Daily-Web/actions/runs/38896325484) 成功；Pages [38896377597](https://github.com/dongyu19920904/BioAI-Daily-Web/actions/runs/38896377597) 构建、测试、GEO/时间线检查及部署成功。同步清理最终版本 Pages [38897825678](https://github.com/dongyu19920904/BioAI-Daily-Web/actions/runs/38897825678) 也已构建并部署成功，head 为 `66a40a6c`。
- [线上日期页](https://news.aibioo.cn/2026-10/2026-10-16/)、[首页](https://news.aibioo.cn/)及[时间线](https://news.aibioo.cn/timeline/)已通过实际浏览器检查。桌面 1440x1000、手机 390x844 均 HTTP 200，TOP10 连续、没有旧导读/固定预测、没有横向溢出；6/6 来源图片加载成功，时间线最新日期为 2026-10-16、当天两个节点正常。
- 本机 BrowserOS neo 接口返回 502，实际线上验收使用隔离 Playwright，不冒称使用 neo。检查 JSON 与截图保留于 `D:/CodexCache/artifacts/bioai-structure-20261015/production-checks.json` 及同目录截图。
- 最终后端测试 167/167，前端 23/23；PR 构建与正式 Pages 检查通过。对 297 篇日刊做只读同步重放，未变化正文将导致的写入数为 0。带链接配图的下游复用回归测试通过；最终组装重放仍为 7772 字符，没有新增模型调用。

发布前原定时任务生成了更鲜的 10 月 16 日稿，因此最终采用 `04d4340b` 的新稿重排，而非较早的本地样稿。10 条 TOP 的事实正文和证据边界原样保留；原有六张图片（包括 SIRT1 图示）均能在当天来源素材中找到。新稿原文另存前端 `docs/daily-structure-20261016/2026-10-16-original-04d4340b.md`，早期归档仍保留。只改变标题/短结论、引用位置和分类；辅助条目的“510(k)批准”校正为“510(k)许可”。

当前正式文章：摘要、TOP10、产品更新 1 条、前沿研究 1 条、开源项目 2 个、证据问答 1 个、原图 6 张。没有真实素材的社媒、行业或趣闻栏目省略。未来生成采用相同模板，但不承诺模型事实永久零错误或外部 API 永远可用；标题/短结论长度也仍可能偏离目标，保留真实来源和科学边界供核查。

首次正式同步曾把历史文章末尾空白、换行和一处正文 BOM 统一化，未改历史事实。已用 PR #7 还原该任务产生的格式批改，并补充“正文未变则不写文件”和首页元数据不变则复用头部，避免反复扰动历史稿。Git 历史保留该清理过程，没有强推或重置用户目录。

原始 `D:/GitHub/CloudFlare-BioAI-Daily` 和 `D:/GitHub/BioAI-Daily-Web` 中已有的未提交修改未覆盖。工作在隔离 worktree 完成，最终版本以 GitHub main 与上述生产版本为准。产物/截图/本地预览保留在 D 盘，按次临时目录由缓存包装器清理；Wrangler 本次生成的仓库缓存变动已清理，没有提交凭据。

## 2026-10-16 继续交付过程

用户已要求继续直至完成。当前在隔离分支 `codex/bioai-daily-structure-20261016` 推进，不混入未合并的 iFixAi PR #58。

- 已完成：当天缓存只读预览入口及 GitHub Actions 受控调用；后端完整测试 160 项通过。
- 已完成：上传不承接生产流量的 Worker 版本 `d3de98f3-5d04-4ecd-9906-78c62e119232`；预览地址 `https://d3de98f3-cloudflare-bioai-daily.sabrinamisan090.workers.dev`。
- 待完成：真实模型正文与摘要预览、完整验稿、前端同步链路复验、合并发布、线上日期页及首页验收。
- 发布前生产版本：`09c50052-4571-4130-a698-d20f37c461bb`（100%）。保留为回滚目标。

新增最小修复：预览必须通过现有 TEST_TRIGGER_SECRET，限定同步 daily；只读指定日期 news/project/paper/socialMedia 缓存，不抓取、不写 KV、不写 GitHub。前端同步原来会丢掉 Worker 写入的日期/图片/独立描述，改为保留原有 YAML 头部，更新正文；首页链接改指当天最新日期页。

### 真实预览与最终代码复验

共完成四轮真实模型试生成，均 HTTP 200，未写入 GitHub 或 KV。不是只看成功标记：

1. [38891214391](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/actions/runs/38891214391)：发现原图遗漏、通用 Transformer 论文、EHR 两个不同分析的数字被拼接、人体先导研究阶段标注不准。未发布。
2. [38892428174](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/actions/runs/38892428174)：配图、区间与阶段问题已改善；仍有农业论文、标题数字不一致和薄摘要的机制扩写。未发布。
3. [38893207655](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/actions/runs/38893207655)：使用更新后的当天缓存，领域与薄证据限制生效，但模型跨栏目重复同一事件。未发布。
4. [38894199814](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/actions/runs/38894199814)：10 条 TOP、14 个不同新闻/项目来源、6 个来源站点、5 张来源配图；没有重复新闻、农业论文或前面出现的矛盾数字。问答仍扩写二手素材没有提供的监管解释，因此最后增加确定性问答过滤。

最终代码对第 4 轮已生成稿做零模型调用的离线重放：7772 字符，10 条 TOP，14 个不同新闻/项目来源，5 张来源配图，不发布缺少可靠依据的监管/法律问答。原始模型输出与重放结果分别保留，未伪称过滤后又调用了一轮模型。自动检查按 Markdown AST 核对栏目、TOP 数、来源唯一性及来源属于当天缓存。

相关最小修复：复用现有论文主题筛选，同时为普通日报排除没有人类生物医学关联的纯农业应用；复用已有 source-matched media 逻辑恢复模型漏掉的真实配图，不增加模型请求；按来源 URL 做发布前跨栏目去重；仅普通日报问答过滤监管/法律扩写。人体先导阶段、数据对应关系、二手来源标注与薄摘要边界写入生成约束。

后端完整测试最终 166/166，前端 22/22。前端结构测试改为动态读取最新日期，避免明天首页变化导致 CI 错误。

今天要发布的仍是已保留原事实段落的 10 月 16 日结构重排版，而非用新试稿覆盖好稿。新的模型预览验证后续自动生成模板。现阶段没有声称所有后续 LLM 事实都零错误，特别是标题长度和短结论长度仍可能偏离提示词目标，需要持续内容验收。

下面的“发布边界”记录上一阶段本地交付状态，最终发布结果以本节后续补记为准。

对照日期：2026-10-15 至 2026-10-16。检查跨过午夜后，BioAI 最新已为 10 月 16 日，AI 日报最新仍为 10 月 15 日（16 日文件尚未生成）。参考后端 `CloudFlare-AI-Insight-Daily@17b28da76`，参考任务“AI日报-日常维护”。只调整 BioAI 普通日报，不改两个商机栏目或 AI 日报项目。

## 对照结果和方案

AI 日报现有结构：三句话摘要、今日焦点 TOP10、产品与功能更新、前沿研究、行业变化与个人影响、开源 TOP 项目、社媒精选、可选趣闻、相关问题。没有材料的栏目省略，10 月 15 日实际展示 TOP10、开源、社媒、趣闻和问答。

BioAI 旧结构：摘要、失效快速导航、一句话、关键词、重复的可引用要点、重磅 TOP10、值得关注、值得细看、固定概率趋势预测。普通条目标题是加粗链接而非三级标题，难以从目录直接扫描。

实施顺序：

1. 普通日报生成提示词改为相同栏目顺序、纯文本三级标题、开头短结论、正文内来源链接、短句与事实重点；保留原有领域筛选、证据阶段及医疗边界。
2. 复用 AI 日报的精简组装思路：只在发布时生成一次三句摘要，不再注入一句话/关键词/重复证据汇总/失效导航。
3. 将证据与局限直接放在相关条目中；相关问题承接旧“值得细看”的证据解释。取消强制预测概率和固定日期栏目。
4. BioAI 开源项目仍用现有小众科研候选，不套普通 AI 工具的 Trending/高星门槛。输入有项目或社媒时先预留专栏；没有真实素材不复制 TOP 新闻或编造内容。
5. 用最新 10 月 16 日现有正文制作改版：保留 TOP10、原段落、原图和重要证据边界，移除重复汇总，归类未重复的补充信息，把证据辨析放入相关问题。旧预测留在修改前归档中，不能冒充新事实。
6. 时间线适配“纯文本标题 + 正文内链接”，仍只采集 TOP2，不能误采图片、广告或问答。
7. 完成后端测试、前端测试、Hugo 构建及桌面/手机预览；分别记录本地预览和实际发布状态。

内容数量和科学判断不因结构改造放宽；不新增抓取源、模型调用轮次或 Cron。完整栏目模板可统一，实际展示的栏目由当天有效素材决定。

## 实施与验收记录

- 后端：普通日报正文与摘要提示词、手动/定时共用组装函数、候选栏目预算、正文内引用要求、搜索描述栏目过滤已调整。
- 前端：最新日报原始 Markdown、日期页与首页同步重排；时间线兼容纯文本 H3 标题并读取正文来源，保留旧版解析。
- 当前改版：10 条 TOP、1 条前沿研究、2 个开源项目、1 个证据问答、6 张原图。没有独立产品/行业/社媒/趣闻素材时不造内容填栏目。
- 完整旧版留在前端 `docs/daily-structure-20261016/2026-10-16-original.md`。机械重排脚本断言原 TOP10 正文段落未删改。没有重新写新闻或调用模型。
- 后端完整 Node 测试通过，最终定向复验 9/9；Wrangler dry-run 打包通过；前端测试 20/20，生产参数 Hugo 构建通过。时间线检查为 13 期、26 张卡片，最新日期 2026-10-16；GEO 产物检查通过。
- Playwright 检查桌面 1440x1000、手机 390x844 的深/浅色四种视图：一个 H1、TOP10 编号连续、15 个正文来源链接、零横向溢出。单独触发图片加载后 6/6 成功；时间线当天 2 个来源链接均正确。
- 本地入口：`http://127.0.0.1:1326/2026-10/2026-10-16/`。截图及检查 JSON 位于 `D:/CodexCache/artifacts/bioai-structure-20261015/`。
- 构建过程异常记录：一次本地加速重建临时加了 `--enableGitInfo=false`，历史文章因此缺少 `dateModified`，GEO 检查失败。未修改源码或放宽检查，已恢复生产 Git 信息参数，使用仅位于缓存目录的 [Hugo 分段构建](https://gohugo.io/configuration/segments/) overlay 重建最新页、首页、时间线和三个历史验证页；GEO 与时间线复验通过。这个加速参数不能作为生产发布配置。最初的完整生产参数构建也已通过。

## 初次本地交付边界（历史）

本次交付为隔离 worktree 中的实现和可查看改版。没有推送 main、部署 Worker 或覆盖线上好稿；原始两个工作目录中的用户改动未触碰。

新模板已接入代码中的定时与手动生成入口，但尚未用真实模型生成新稿并完成阅读验收，因此不能声称线上后续日报已经切换，也不能保证未来所有模型输出都遵循模板。正式发布前仍需使用现有安全凭据做一次不覆盖好稿的真实预览，完整检查来源、栏目、图片和证据边界，再部署最终 Worker 和前端。

历史月份不批量改写；两个商机栏目、其他项目、模型/账号/额度和 Cron 均未改变。回滚时恢复本分支之前的模板/组装代码和本次归档原文即可，不需要重置用户原工作目录。

## 文件级 Diff 总结

后端 worktree：`D:/GitHub/CloudFlare-BioAI-Daily-structure-20261015`。

| 文件 | 变更 |
| --- | --- |
| `src/prompt/summarizationPromptStepZero.js` | 普通日报统一八类栏目顺序和条目格式；保留领域、证据、医疗边界及小项目标准 |
| `src/prompt/summarizationPromptStepThree.js` | 三句摘要只概括当天正文，不重复前言或编数字 |
| `src/bioDailyMarkdown.js`（新增） | 一次性组装摘要和正文；剥离 TOP 前冗余前言；统计现有项目/社媒候选，不增加抓取 |
| `src/handlers/scheduled.js` | 定时日报接入栏目预算与统一组装，删除失效导航和正文中间广告注入 |
| `src/handlers/genAIContent.js` | 手动日报复用相同组装，清理不再使用的广告导入 |
| `src/prompt/geoCitationGuidelines.js` | 普通日报引用移到具体条目内；商机规则不变 |
| `src/utils/reportMetadata.js` | 搜索描述跳过新栏目名，从具体主题提取 |
| `tests/bioDailyMarkdown.test.mjs`（新增） | 组装、栏目顺序、素材预算、证据及媒体保留回归测试 |
| `tests/reportMetadata.test.mjs` | 新结构的描述主题提取测试 |
| `tests/geoCitation.test.mjs` | 与条目内引用规范同步 |
| 本文（新增） | 方案、实施状态、验证结果与发布边界 |

前端 worktree：`D:/GitHub/BioAI-Daily-Web-structure-20261015`。

| 文件 | 变更 |
| --- | --- |
| `daily/2026-10-16.md` | 最新原始日报重排为统一结构 |
| `content/cn/2026-10/2026-10-16.md` | 日期页同步正文和真实主题描述 |
| `content/cn/_index.md` | 首页同步同一正文和描述 |
| `layouts/partials/timeline/collect-bioai-signals.html` | 兼容纯文本标题及正文来源，旧版仍可解析 |
| `layouts/timeline/list.html` | 时间线来源说明兼容新旧栏目名 |
| `tests/bioai-timeline.test.cjs` | 新标题和来源链接解析契约 |
| `tests/daily-structure.test.cjs`（新增） | 三份正文一致、TOP10、栏目顺序、科学边界及原图来源检查 |
| `docs/daily-structure-20261016/2026-10-16-original.md`（新增） | 修改前完整日报归档 |
| `docs/daily-structure-20261016/README.md`（新增） | 改版说明和未上线状态 |

## 继续交付追加 Diff

- 后端 `src/index.js`、`.github/workflows/manual-trigger-worker.yml`、`tests/dailyPreview.test.mjs`：密钥保护、指定日期缓存只读预览；版本 URL 限定本账号 BioAI 域名；预览只存工作流产物、不覆盖正式稿。
- 后端 `src/blogMedia.js`、`src/bioDailyMarkdown.js`：复用来源配图匹配、发布前跨栏目 URL 去重、监管/法律扩写问答过滤；不额外调用模型。
- 后端 `src/dataSources/longevity-rss.js`、`src/handlers/scheduled.js`、`tests/longevityRss.test.mjs`：导出现有主题规则用于所有日报论文候选；仅普通日报额外排除纯农业应用。抓取和商机筛选流程不改。
- 前端 `.github/workflows/build-book.yaml`、`scripts/sync-daily-page.cjs`、`tests/daily-sync.test.cjs`：保留 Worker 元数据、首页指向最新日期；未变化时字节稳定，不生成无关历史提交。
- 前端 `tests/daily-structure.test.cjs`：按最新日期检查，允许真实素材决定可选栏目，避免首页换日后误报。
- 前端 `docs/daily-structure-20261016/2026-10-16-original-04d4340b.md`：保留发布前最新自动稿原文，防止误用旧素材。
