# BioAI 三栏目统一发布回执

日期：2026-10-26（Asia/Shanghai）。用户明确授权“授权推送并上线代码”；范围为已整合的 BioAI 后端和三栏目排版前端，不手动触发付费生成、不改写历史日报。

## 已发布版本

| 项目 | 版本与状态 |
| --- | --- |
| 后端源码 | `dongyu19920904/CloudFlare-BioAI-Daily`，`main` 正常快进到 `9f24ec6cdcad7b440ae7af659b16294bfc26715f`；保留个人博客与 BioAI 三栏目全部整合修复。 |
| 前端源码 | `dongyu19920904/BioAI-Daily-Web`，`main` 正常快进到 `cb617a84624a183cec75b79911bc508191b29a38`，无强推、无历史 Markdown/records 改写。 |
| 后端 CI | [40289381981](https://github.com/dongyu19920904/CloudFlare-BioAI-Daily/actions/runs/40289381981)，对应整合源码，success；整合版本机完整测试此前 302 通过。 |
| 前端 Pages | [40289393933](https://github.com/dongyu19920904/BioAI-Daily-Web/actions/runs/40289393933)，对应前端提交，测试、Hugo 构建、产物校验和 deploy 均 success；发布完成时间为 2026-10-26 16:04:26 +08:00。 |
| Worker | `cloudflare-bioai-daily`，生产版本 `ff17e4f1-d0d1-48da-a508-77677be8d2fc`，部署记录 `c6af2ec5-6d93-4456-b2fe-20a806cb6dd2`，已回读确认 100% 生产流量。创建时间 2026-10-26 16:05:46 +08:00。 |

Worker 使用本机已有 Wrangler 4.59.2，从已验收整合版部署一次，带 `--keep-vars`，未安装/更新工具。实际发布 bundle 的 SHA-256 与发布前 dry-run 完全一致：`8c9d345d8b66fa8af7b105b3203a544e1f1a1fbb666f9dbf6a44150d55692c85`；651.99 KiB / gzip 156.35 KiB。

发布前后通过官方版本接口读取并比较配置指纹：32 项普通变量完全一致；`DATA_KV`、`PROJECT_LAB_RATE_LIMITER` 的资源绑定不变；7 项 Secret 的名称与绑定保留。未读取/导出 Secret 值，不将绑定比较误称为 Secret 明文比较。原有三个 cron 保留：`20 11 * * *`、`30 11 * * *`、`30 12 * * *`。没有改变入口、模型线路、定时规则或手动运行 self-heal。

## 发布后验收

真实生产域名 `https://news.aibioo.cn`，既有独立 Playwright/Chromium 151.0.7922.34 上完成 20 个状态：主页、10-26 日报、10-17 历史日报、10-24 商机、10-26 项目商机，各自桌面 1440×1000 / 手机 390×844、日间/夜间。

核对结果：均 HTTP 200；新指纹 CSS 已加载；正文最大宽度 768px；桌面 17px/30.6px、手机 16px/28.8px；无页面横向溢出；单 H1、canonical、正文来源链接保留；原生主题按钮不重载页面、不改变正文；实际 PNG 像素宽高一致；无 pageerror 和新增样式资源错误。实测指纹样式为 `bioai-columns.min.60c97d712f657dd7e487cf5a0526f998f1ce86826094053beedd136d01dffd63.css`。

验收拦截了 51.LA 统计，隔离外部雷达 JSON 与图片代理请求，避免测试产生统计噪声；因此不将这些截图声称为第三方图片、雷达数据或完整站点性能验收。没有操作日常 Chrome、共享 neo 标签或其他任务预览进程。

Worker 不带凭据的只读检查：`/login` HTTP 200 且存在登录表单；`/` HTTP 302 到登录页；三个 `/testTriggerScheduled*` 入口带一致日期/sync、商机带 `mode=opportunity`，但不带密钥，均 HTTP 401。认证守卫在任务执行前拒绝，**实际生成触发次数为 0**；未访问模型测试接口、没有手动产生新日报或 records。HTTP 401 只证明认证边界，不证明真实生成质量。

## 生效范围与仍待验证

已上线的是三栏编辑合同、保存前的保真格式/安全检查和局部正文排版，以及整合版保留的个人博客后端修复。个人主页 Astro 前端、AI 主日报、商城代码不属于这次发布范围。

历史文章文字不自动重写；现有文章中的旧措辞不能视为新规则生成效果。新合同将用于后续原有定时任务。下一次真实三栏生成、provider 可用性、内容质量、来源时效、时长与费用尚未在本轮验证，不以 CI、页面 200 或 selectedCount 代替这一验收。生成接口仍只接受 `key` 查询参数；本次没有更改认证或在日志/链接中传入密钥。

## 回滚与证据

发布前回滚点为 `9c0cc8d5-412c-40f4-bd75-106b30d86086`，不要误用更老的 `6fb8f974` 覆盖后续个人博客修复。若发生实际回归，先检查期间是否又有新部署，再通过官方 rollback 恢复正确版本；本次未执行回滚。前端回滚应在最新 main 上 revert 样式提交，不 reset/强推旧内容快照。

本地证据保留在 `D:\CodexCache\artifacts\bioai-columns-editorial-20261026`：`release-manifest.json`、`release-integration-tests.log`、`worker-settings-before.json` / `worker-settings-after.json`（仅指纹/绑定信息）、`published-bundle/`、`production-browser/report.json` 与 20 张生产截图。代码目录仅有既有 Wrangler 账户缓存运行时变化，未暂存进发布提交；命令临时目录由 D 盘缓存包装器清理，共享依赖缓存和验收证据保留。

本文件为发布后的纯文档回执，不改变已部署源码，不为记录回执重复部署 Worker 或触发前端构建。
