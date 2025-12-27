# CloudFlare AI Insight Daily - 项目架构与制作流程总结

## 1. 项目概述
本项目是一个全自动化的 AI 资讯聚合与生成系统。它利用 Cloudflare Workers 进行无服务器计算，结合 AI 模型（Gemini/OpenAI/Claude）对多源信息进行抓取、清洗、总结，最终生成 Markdown 格式的日报和周报，并通过 GitHub Actions 自动构建为静态网站（mdBook）。

## 2. 核心技术栈
-   **计算层**: Cloudflare Workers (JavaScript/ES Modules)
-   **存储层**: Cloudflare KV (缓存原始数据), GitHub Repository (持久化存储 Markdown 内容)
-   **AI 引擎**: Google Gemini (默认) / OpenAI / Anthropic (通过 API 调用)
-   **构建部署**: GitHub Actions + Docker + mdBook + GitHub Pages

## 3. 自动化工作流

### 3.1 每日日报生成 (Daily Workflow)
*   **触发**: Cron 定时任务 (`0 0 * * *` UTC)。
*   **流程**:
    1.  **数据抓取**: Worker 并行请求多个信息源（GitHub Trending, Hacker News, HuggingFace Papers, 微信公众号RSS等）。
    2.  **数据清洗**: 去除 HTML 标签，提取核心文本。
    3.  **AI 总结**: 将清洗后的数据发送给 LLM，要求其按“今日摘要”、“新闻详情”、“工具推荐”等板块生成 Markdown。
    4.  **广告注入**: 在生成的内容中动态插入 `aivora.cn` 的推广文案。
    5.  **持久化**: 调用 GitHub API，将 Markdown 内容提交到仓库的 `daily/YYYY-MM-DD.md`。

### 3.2 每周深度博客 (Weekly Blog Workflow)
*   **触发**: Cron 定时任务 (`0 1 * * 5` UTC，即周五)。
*   **流程**:
    1.  **读取历史**: Worker 读取 `daily/` 目录下过去 7 天的 Markdown 文件。
    2.  **AI 深度分析**: 将 7 天的内容汇总，发送给 LLM，要求其识别“核心叙事线索”，撰写一篇有观点、有深度的周报。
    3.  **持久化**: 将生成的文章提交到仓库的 `blog/YYYY-week-XX.md`。

### 3.3 网站构建与发布 (Build & Deploy)
*   **触发**: 当 `daily/` 或 `blog/` 目录有新文件提交时。
*   **流程**:
    1.  **GitHub Action**: 启动 `build-daily-book.yml`。
    2.  **生成目录**: 运行 `cron-docker/scripts/work/gen.sh`，扫描 `daily/` 和 `blog/` 目录，自动生成 `SUMMARY.md`（mdBook 的目录文件）。
    3.  **构建电子书**: 使用 `mdbook build` 将 Markdown 转换为静态 HTML。
    4.  **发布**: 将生成的 HTML 推送到 `gh-pages` 分支，完成上线。

## 4. 关键文件说明
-   `src/index.js`: 入口文件，处理 Cron 调度和 HTTP 请求路由。
-   `src/handlers/scheduled.js`: 日报生成的核心逻辑。
-   `src/handlers/scheduledWeeklyBlog.js`: 周报生成的核心逻辑。
-   `src/ad.js`: 管理广告文案和插入逻辑。
-   `cron-docker/scripts/work/gen.sh`: 关键的 Shell 脚本，用于动态生成网站目录结构。

## 5. 扩展与维护
-   **添加新数据源**: 在 `src/dataSources/` 添加新的 Fetcher，并在 `src/dataFetchers.js` 注册。
-   **修改 Prompt**: 所有 AI 提示词均在 `src/prompt/` 目录下，可根据需要调整生成风格。
-   **更换 AI 模型**: 在 `wrangler.toml` 中修改 `USE_MODEL_PLATFORM` 和对应的 API 配置。

---
*文档生成日期: 2025-12-20*
