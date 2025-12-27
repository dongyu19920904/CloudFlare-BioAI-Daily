# 全自动 AI 日报项目改造与部署方案

> **目标示例**：将原始的 CloudFlare-AI-Insight-Daily / Hextra-AI-Insight-Daily 项目快速改造成“AI 生命科学每日资讯”或其他垂直主题站点，并上线到自有域名。

## 1. 总体流程

1. **准备两个仓库**  
   - 后端（Cloudflare Worker）：`CloudFlare-AI-Insight-Daily`
   - 前端（静态站点）：`Hextra-AI-Insight-Daily`
2. **拉取并改造后端**：配置数据抓取、Prompt 语言风格、自动化任务。
3. **拉取并改造前端**：品牌视觉、导航、内容渲染逻辑、工作流与域名。
4. **绑定域名与部署**：GitHub Pages + DNS + (可选) Cloudflare 自定义域。
5. **回归测试与运维**：日常生成、周报生成、KV 存储、GitHub Actions 结果。

---

## 2. 后端（Worker）改造

| 步骤 | 操作 | 说明 |
|------|------|------|
| 2.1 | Fork 或 Clone `CloudFlare-AI-Insight-Daily` | 建议保持 upstream 便于同步。
| 2.2 | 本地安装依赖 | `npm install`（若需要本地调试）。
| 2.3 | Cloudflare Setup | `wrangler login` → `npx wrangler kv:namespace create DATA_KV`。
| 2.4 | 配置 `wrangler.toml` | 设置 `name`、`main`、`kv_namespaces`、`vars`（新品牌标题、API URL、插入广告、APP 链接等）。
| 2.5 | 设置 Secrets | `npx wrangler secret put GITHUB_TOKEN` 等 6 个秘钥（Claude/OpenAI/Gemini/Login）。
| 2.6 | Prompt 改造 | 编辑 `src/prompt/summarizationPromptStepZero.js`、`summarizationPromptStepTwo/Three.js`，让语气符合新垂直（如 AI 生命科学：加入 LLM 术语、行业 slang、图片/链接格式要求、评论引导等）。
| 2.7 | 自动化任务 | `src/handlers/scheduled.js`（每日）与 `scheduledWeeklyBlog.js`（周报）可复用，必要时调整内容拼装逻辑（分类、字段）。
| 2.8 | API 数据源 | `src/dataSources/*.js` & `dataFetchers.js`：如需换成生物医药资讯源，在这里新增/替换。
| 2.9 | 本地测试 | `npx wrangler dev` 打开 `http://localhost:8787/getContentHtml`，验证登录/生成/保存流程。
| 2.10 | 部署 | `npx wrangler deploy`，确保终端输出包含 `schedule` 信息。

**加速小贴士**
- 新主题可在 `env.DAILY_TITLE/DAILY_TITLE_MIN` 里换名字，例如“AI 生命科学情报局”。
- 评论引导、推广语等放在 Prompt 中集中管理。

---

## 3. 前端改造

| 模块 | 关键文件 | 改造点 |
|------|----------|--------|
| 主题配置 | `hugo.yaml` | 修改 `title`、`baseURL`、`params.description`、`params.subTitle`、`navbar`、`author`、`publisher`；若部署到自域名，要同步更新 `baseURL`。
| 内容目录 | `content/cn/_index.md`、`content/cn/YYYY-MM/*.md` | 这些由工作流自动生成；人工只需确认格式正确。
| 博客聚合页 | `content/cn/blog/_index.md` | 修改标题（如“AI 生命科学周刊”）、引导语、RSS 链接。
| 品牌素材 | `static/images/`, `assets/css/custom.css` | 替换 logo、主色等。
| 互动模块 | `layouts/partials/*` | 可在 footer/侧边栏加入社群入口。

### GitHub Actions（`build-book.yaml`）

1. **确保默认仓库是自己**：
   ```yaml
   repository: ${{ github.event.inputs.source_repo || '你的用户名/CloudFlare-AI-Insight-Daily' }}
   ref: ${{ github.event.inputs.source_branch || 'main' }}
   ```
2. **定时任务**：`cron: '0 22 * * *'` 表示每天 UTC 22 点运行，可改为合适时间。
3. **变量**：若需图片代理，设置 `IMAGE_PROXY_URL`、`FOLO_IMAGE_PROXY_URL`。

触发顺序：
- 后端每日任务推送 Markdown 到后端仓库 `daily/*.md`。
- 前端 workflow 拉取后端 repo → 处理 → 写入 `content/cn` → 推送自身仓库 → GitHub Pages 自动部署。

---

## 4. 域名部署（GitHub Pages）

1. 前端仓库 `Settings → Pages`：
   - Build from GitHub Actions；
   - Custom domain 填 `news.yourdomain.com`。
2. DNS 添加：
   - `news` 的 `CNAME` → `用户名.github.io`；
   - 如需所有权验证，添加 `_github-challenge-用户名` 的 `TXT` 记录。
3. 等待证书生效后勾选 “Enforce HTTPS”。
4. 同步更新 `hugo.yaml` → `baseURL: https://news.yourdomain.com/`。

（可选）如需 Worker 自定义域名，在 Cloudflare Dashboard → Worker → `Triggers` → Add custom domain。

---

## 5. 迁移到“AI 生命科学”主题的 checklist

1. **命名**：
   - `DAILY_TITLE`、`PODCAST_TITLE` 改成“AI 生命科学日报”等。
   - Prompt 中的分类换为生命科学维度（如“药物发现”“科研进展”“临床试验”“开源工具”等）。
2. **数据源**：
   - 选择 BioRxiv、MedRxiv、PubMed RSS、Synapse、药监局公告、Biotech 新闻等；
   - 在 `dataSources` 中新增适配器，统一字段（title/url/summary/time/type）。
3. **语言风格**：
   - Prompt 里强调专业但有梗的语气，加入领域术语（CRISPR、CAR-T、蛋白质结构预测等）。
4. **推广位**：
   - 若要推广“AI 医药工具账号”，修改 `insertAd()`、`foot.js` 内容。
5. **评论 & 社群 CTA**：
   - 在 Prompt 中加入“欢迎留言分享你最期待的临床试验”等 CTA。
6. **前端文案**：
   - `README`、`About` 页面介绍换成“AI 生命科学”定位。
7. **周报/博客**：
   - `weeklyBlogPrompt` 改成生命科学主题，输出“AI Life Science Weekly”。

---

## 6. 运维与排障

| 场景 | 处理方式 |
|------|----------|
| 日报未更新 | 检查 Cloudflare Worker 日志（Dashboard → Workers → Logs），确认 KV/Secrets、令牌权限；必要时手动触发 `/writeData` + `/genAIContent`。|
| 前端仍显示旧内容 | GitHub Actions 是否成功；workflow 默认拉取仓库是否改为自己；`content/cn` 提交历史。|
| 自定义域名跳转错误 | 检查 DNS 是否 proxy、GitHub Pages Custom Domain 是否保存、证书状态。|
| 图片失效 | 启用图床代理或在 worker 侧 `replaceImageProxy()` 处理。|

---

## 7. 快速复用模板

1. **克隆后端** → 调 Prompt → 部署。
2. **Fork 前端** → 改 `hugo.yaml` + 主题文案 → 修 workflow 默认仓库。
3. **运行后端手动生成**（登录 Worker → 抓取 → 勾选条目 → 生成 → “保存到 GitHub”）。
4. **手动触发前端 workflow** → Inspect `content/cn` 是否包含新文章。
5. **绑定域名** → 验证、更新 `baseURL`、推送。
6. **观察**：
   - Cloudflare Cron（每日 & 每周）日志；
   - GitHub Actions 结果；
   - Pages 构建状态。

至此，你可以把任意作者的原始项目复制并改造成“AI 生命科学每日资讯”或其他垂直领域站点。如需进一步自动化（多语言、推送到飞书等），可在 Worker 中继续扩展。
