# BioAI 日报 Agent：iFixAi 审计、优化与复验

日期：2026-10-15。审计基线：`94426be`。目标为 `CloudFlare-BioAI-Daily` 的来源校验、商机批任务及定时入口；未扩展到农业日报或项目工厂。

## 结果

| 检查 | 修改前 | 修改后 |
| --- | --- | --- |
| 固定输入实际执行来源门禁 | 6/9 | 9/9 |
| iFixAi 4.1.1 trajectory audit | BLOCK，3 项违规 | CLEAR，0 项违规 |
| 该离线轨迹的覆盖缺口 | 0 | 0 |
| 策略摘要 | 相同 | 相同 |
| 修复后 bundle 离线 replay | 不适用 | CLEAR |

全量后端测试 160/160 通过；之后新增的真实 Worker `scheduled` 入口隔离测试 1/1 通过，共执行 161 项。Wrangler dry-run 打包通过，约 599.50 KiB / gzip 138.62 KiB。

本轮没有计费模型调用、生成线上日报或部署 Worker。代码在独立工作树和修复分支中；不能把本报告解释为生产版本已经切换。

## 已定位并修改的问题

1. **DOI 规范化不一致**：机器记录将 DOI 转为小写，门禁白名单保留大小写，导致同一输入 DOI 被拒并多调用一次生成。现在共享相同 URL 规范化函数。
2. **真假引用混合通过**：原来一个主推里有任意一个已知链接即可通过，第二个伪造链接可混入。现在每个来源链接均须属于选中素材的来源 URL 集合。
3. **描述中的链接扩大信任范围**：原来从整段提示词提取允许链接，来源描述里的额外链接也被信任。现在生产调用从选中条目的 `url` 字段单独构建白名单并传入门禁。
4. **批任务故障互相影响**：第一个商机生成抛错时第二个不会运行；旧汇总的 OR 条件可能将部分成功报告为整批成功。现在继续使用同一抓取快照、顺序执行、隔离两项失败，只有两项都完成才成功，并保留各项结果、失败列表及部分成功状态。
5. **定时失败不反馈平台**：处理器返回 `success: false` 后定时入口仍正常结束，Cloudflare 可能将失败任务记作正常执行。现在失败显式抛出，HTTP 手动入口仍保留原有结果格式。
6. **重试反馈不足**：原纠正提示只有泛化规则；现在给出缺失来源、非白名单来源的条目名及健康风险布尔值，仍最多两次生成。

最初怀疑的 `**证据来源：**` 格式已被实际用例排除，不作为发现，也未为此修改解析器。

## 改动文件

- `src/opportunityRecords.js`：导出复用的来源 URL 规范化接口。
- `src/opportunitySourceGate.js`：统一 DOI 身份、拒绝混合伪造引用、使用显式来源白名单、改进重试反馈。
- `src/opportunityBatch.js`、`src/handlers/scheduled.js`：独立执行结果与完整成功判定；all 模式也要求普通日报成功。
- `src/index.js`：将定时任务返回的失败传递给 Cloudflare。
- `tests/opportunitySourceGate.test.mjs`、`tests/opportunityBatch.test.mjs`、`tests/scheduledCompletion.test.mjs`：来源、故障隔离、实际入口回归。
- `scripts/ifixai/`：离线实际函数探针和显式轨迹转换器，不进入 Worker 运行链。

## 评测范围与证据

探针调用真实 `generateWithSourceGate`，生成器被固定的合成草稿替代；没有调用真实模型、GitHub 写入或科研服务。九份输入和预期条件保持相同，修复前后 iFixAi policy digest 相同。iFixAi 检查的是这些已记录的本地接受/拒绝动作是否满足声明策略，不是给整个线上 Agent 打综合分。

轨迹转换器明确标记 `production_trajectory: false`。本地完整性只指本轮九项探针，不宣称生产轨迹完整。重试预算单位为固定草稿回调次数，不能当作 token、人民币或账户账单。引用检查把本地决策连接到用例摘要，不证明论文事实、临床疗效或许可证。审批和委派两类未评测。

原有健康自测/风险评分拦截和无来源不发表规则保留。没有将不合格的具名项目替换成虚假的推荐或成功状态。10 月 15 日线上商机仍有健康风险与来源校验失败记录；本轮没有取得失败草稿全文，不能证明此次发现就是每次线上失败的全部原因，也不能声称已补发该期。

原始证据见 `docs/ifixai-20261015/` 中的 before、after、replay 目录和 observations JSON，可离线打开 HTML。iFixAi 只需本机安装，不作为 Cloudflare 运行依赖。

## 复现

在项目目录内，通过 D 盘缓存包装器执行以下命令；将 `RUN` 替换为尚不存在的新证据目录，防止覆盖旧结果。

```powershell
node scripts/ifixai/probe-source-gate.mjs RUN/observations.json
D:/CodexTools/iFixAi/venv/Scripts/python.exe scripts/ifixai/build_trajectory.py RUN/observations.json RUN/input
D:/CodexTools/iFixAi/Invoke-iFixAi.ps1 -ProjectPath . -Arguments @('trajectory','audit','RUN/input/policy.json','RUN/input/trace.jsonl','--output','RUN/audit')
D:/CodexTools/iFixAi/Invoke-iFixAi.ps1 -ProjectPath . -Arguments @('trajectory','replay','RUN/audit/bundle.json','--output','RUN/replay')
```

生产上线前剩余验收：使用最终代码在隔离环境做真实素材生成并完整读稿，再部署和回查真实日期页。真实模型对抗评测须先 dry-run 展示调用估算，并使用已明确授权的独立测试凭据和费用范围；本轮未发生该项费用。
