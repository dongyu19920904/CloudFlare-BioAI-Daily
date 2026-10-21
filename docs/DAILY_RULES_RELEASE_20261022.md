# BioAI 自动写作规则发布验收

## 范围与状态

只调整普通 AI 生命延续学日报的写作与调用可靠性。沿用既有 Worker、仓库、栏目、公开路径和定时任务，不改前端样式、不覆盖已发表稿件，不调整两个商机模块、信息源抓取额度、模型名称或 Secrets。

已于北京时间2026-10-22 02:37发布。生产版本`1a2acf8f-9885-4c70-b3f7-85b8c8885d2e`接收100%流量，运行源码`7ed567271ded5081ffe261f80d2022a75e6b6f30`。195项本地测试及CI39654230052通过。代码与本验收记录归入[PR64](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/pull/64)，合并提交以PR回执为准。

## 最终 Diff 总结

| 文件 | 行为变化 |
| --- | --- |
| `src/prompt/summarizationPromptStepZero.js` | 面向没有医学背景的读者，每条围绕必要核心概念就近解释，保留具体发现和重要数字的上下文；来源融入正文，不加粗导语或堆词汇表。短素材不扩写项目功能、因果关系或人体疗效；合并同一研究的论文与代码事件。 |
| `src/prompt/summarizationPromptStepThree.js` | 三句白话摘要，一句一个重点，第三句只保留前两项最重要的证据边界，不另起新闻；不列缩写、药物代号和指标清单。在正文后重复短摘要提醒。全文编辑提示词仅为未采用实验的兼容导出，当前生成路径不调用。 |
| `src/handlers/scheduled.js`、`src/handlers/genAIContent.js` | 定时与手动入口共用写作提醒、原生系统指令和恢复函数。GitHub输入不再把最近活跃时间写成Published，避免旧项目被写成当天首发。最终采用“正文 + 短摘要”两次调用，不再全文二次改写；来源与摘要在发布前校验。dry-run只读取指定日期缓存，返回完整稿，不写KV或GitHub。失败返回阶段与非敏感诊断。 |
| `src/bioDailyMarkdown.js` | 排除只有通用认知/AI辩论而没有生物医学对象的论文候选，支持aging/ageing；校验正文条目有输入内的来源，处理摘要内URL后的句号/逗号，摘要恰好三行纯文本。跨栏目去重记录每条的全部来源，而非只记录第一个URL，避免论文已经引用仓库、后面仍重复报道仓库；保留媒体修复及TOP重编号。完全没有重叠URL的同事件仍依赖选稿与写作，不冒充通用语义去重。 |
| `src/dailyModelGeneration.js`、`src/workerConfig.js` | 普通日报可独立选择既有主/备线路；当前候选优先用已配置备选`claude-opus-4-8`及对应密钥，不修改传入env，也不改变商机或其他模块的全局主模型选择。流式中断、空输出或暂时网络错误时只做一次非流式恢复，丢弃旧半篇，不拼接两次答案；认证错误不进入该恢复。底层路由已有重试仍存在，不宣称全链路只有一次HTTP重试。 |
| `src/chatapi.js` | 尊重现有显式关闭OpenAI兼容备用的配置；未设置时保留历史默认。普通日报显式使用原生Anthropic系统消息；失败诊断只带路由角色、状态、耗时与错误类别。 |
| `src/modelConnectionProbe.js` | 既有受保护探针分别使用真实主/备线路与对应密钥，256输出token、20秒超时、零重试，不暴露密钥或完整服务商回复。 |
| `.github/workflows/manual-trigger-worker.yml` | 既有手动工作流增加主/备短探针模式，限期保留成功/失败预览产物，日志不打印生成正文；不新增定时工作流。仓库产物遵循GitHub访问权限，不声称只有所有者能下载。 |
| `tests/*.test.mjs` | 覆盖写作提醒、入口一致性、项目活跃日期含义、来源/摘要解析、多来源去重、论文候选、恢复行为、备用关闭开关、日报独立备选配置和主/备探针，全部195项通过。 |

## 验证与风险

完整预览使用10月21日缓存，因为该日期已有完整来源，不刷新抓取、不写仓库，不将测试稿冒充10月22日实时新闻。

此前主/备受保护短探针分别返回200/OK；第三方OpenAI兼容备用返回的401额度错误不能说明Anthropic主/备线路都余额不足。全文二次改写曾在成功返回后仍出现来源遗漏、重复报道和事实扩写，未通过人工审核，所以最终取消该重写步骤，恢复现有两阶段写作方式。

测试只能证明已检查的调用和样本，不能保证未来第三方API永不超时。来源白名单校验不等于独立全文事实核查；短素材仍可能不足以支持十条深入报道，不能用泛AI或编造材料凑数。

正式Cron只读核对为UTC `20 11`、`30 11`、`30 12`，即北京时间19:20普通日报、19:30商机、20:30项目商机。本次不执行`triggers deploy`。

`db8c3a97`的完整预览39651403629虽然技术运行成功，但正文过长、同一事件跨栏目重复，且有素材外公司归属，不符合发布要求。因此在既有授权线路范围内，仅对普通日报做一次备选模型长文验证；备选也失败则不切换生产。模型名称仅表示请求参数，不能据此证明转接服务实际提供者身份或独立推断费用。

备选运行39652362077成功，重复问题改善，来源15处、配图5张、TOP10。但摘要50/62/53字符，仍偏长；且LongevityWorldCup被写成10月21日发布。GitHub官方API核对其创建于2024年9月12日，源码github-trending.js实际将最近活动时间填入统一published_date，普通日报随后误标成Published。这是明确的输入字段问题，现已在两个普通日报入口改为最近活动时间，不修改抓取器共用字段，以免影响其他模块；补充生物年龄差值不等于个人老化加速的边界。源字段修正后只再做一次最终完整验收，不继续泛化调整和反复试调。

回滚保留生产版本：`af5c78ba-98f6-4bfb-bd79-d7d52cf6ce3a`。

## 发布回执

完整真实模型运行：[39653453111](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/actions/runs/39653453111)，约1分14秒，读取10月21日缓存，选取18条素材（新闻8、论文8、项目2），不抓取新源、不写KV或GitHub。模型请求使用已配置备选`claude-opus-4-8`；两个商机模块继续使用原配置。

随后发现纯程序去重只记录第一个链接，补充多来源回归测试。最后这一改动没有变更模型提示词、来源选择、调用函数或模型配置，已通过git diff逐项确认；用刚返回的原始模型正文和摘要重放最终处理，不再付费重生成全文。重放脚本`D:\CodexCache\artifacts\bioai-rules-release-20261022\replay-final.mjs`调用真实最终`assembleBioDailyMarkdown`，不人工改稿。它删除跨栏目重复仓库条目，所有16个不同来源URL完整保留，TOP仍为10条，图片5张，摘要为33/33/41字符。最终样稿在同目录`final-reviewed-preview\preview.md`，JSON明确标注`recorded-model-output-replay`，不能将其描述成最终部署版本再次执行了完整付费生成。

人工审阅范围：全部栏目、摘要、源链接和图片引用，以及缓存提供的核心结果与主要证据边界；没有独立阅读全文所有论文。部分TOP仍略超150-230汉字的指导范围，没有机械截断，也不宣称已达到用户最终满意。无真实社媒素材的栏目省略，没有把新闻伪称原帖。

生产部署ID：`6ef98b01-b582-4551-b812-062b912e5012`；创建于UTC `2026-10-21T18:37:40.511476Z`。Cloudflare API已确认精确版本`1a2acf8f-9885-4c70-b3f7-85b8c8885d2e`为100%。与原版本比较，41个绑定完全一致，七个Secret名称保留，没有读取或显示Secret值。原三个Cron逐一核对不变。

线上非付费冒烟测试：GET `/login`为200；无凭证GET `/testTriggerScheduled`为401；无凭证POST `/testModelConnection`为401。此次未在生产重跑旧日期、未覆盖已发表稿件、未修改前端仓库或样式。下一次真实普通日报调度是北京时间10月22日19:20，当前不能把未来的实际产出写成已经观察到。

保留D盘验收产物用于追溯。缓存包装器自动清理每次TEMP/TMP目录，不改Windows全局变量；Wrangler生成的已跟踪账户名缓存变化单独恢复，不提交缓存。

## 最小复验

在后端工作树执行本地检查（无需新增lint依赖）：

```powershell
git diff --check
& 'C:\Users\dongy\.codex\skills\project-cache-hygiene\scripts\Invoke-WithProjectCache.ps1' -ProjectPath 'D:\GitHub\CloudFlare-BioAI-Daily-structure-20261015' -Command @('node','--test','tests/*.test.mjs')
```

以后需要完整干跑时，使用既有GitHub手动工作流，凭证由仓库Secret注入，不复制密钥；此命令会实际调用模型并计费，不必每天重复执行：

```powershell
gh workflow run manual-trigger-worker.yml --repo dongyu19920904/CloudFlare-BioAI-Daily --ref main -f mode=daily -f target_date=2026-10-21 -f async=false -f dry_run=true
```

选择有完整缓存的真实日期，下载`bioai-daily-preview`阅读全文，检查来源、独立事件、数字与配图。不能只凭工作流绿色判断内容质量。正式更新后检查前端仓库的`daily/yyyy-mm-dd.md`、`content/cn/yyyy-mm/yyyy-mm-dd.md`及首页最新链接。

需要回滚时，通过相同缓存包装器执行`wrangler versions deploy af5c78ba-98f6-4bfb-bd79-d7d52cf6ce3a@100 --yes`，随后再次查询生产版本及原Cron；不执行`triggers deploy`。未来第三方接口可用性和实际费用不能由本次样本保证。
