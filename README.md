#  BioAI 生命科学日报

> 您的每日 AI + 生命科学信息整合、分析、日报、播客内容生成平台。

**BioAI 生命科学日报** 是一个基于 **Cloudflare Workers** 驱动的内容聚合与生成平台。它每日为您精选 AI 与生命科学领域的最新动态，包括行业新闻、热门开源项目、前沿学术论文、科技大V社交媒体言论，并通过 AI 模型进行智能处理与摘要生成，最终自动发布到 GitHub Pages 生成日报。

我们的目标是成为您在瞬息万变的 AI + 生命科学浪潮中保持领先的得力助手，让您高效获取最有价值的信息。

> [!NOTE]
> 日报前端项目：[BioAI-Daily-Web](https://github.com/dongyu19920904/BioAI-Daily-Web)，基于 Hugo + Hextra 主题构建。

---

##  核心特性

*   ** 基于 Cloudflare Workers**：部署在强大的边缘网络，兼具高性能、高可用与零服务器维护成本。
*   ** 集成多种 AI 模型**：支持 Google Gemini、Claude、GPT 等，自动生成高质量、易于理解的内容摘要。
*   ** 支持 Folo 订阅源**：只需简单配置，即可轻松接入 [Folo](https://app.follow.is/) 上的任意信息源。
*   ** 每日自动更新**：通过定时任务实现全自动化流程，每日准时推送最新资讯。
*   ** 高度可扩展**：项目架构灵活，可轻松定制信息源和主题。

---

##  适用人群

- ** 生命科学研究者**：追踪 AI 在生物医药、基因编辑、蛋白质预测等领域的最新应用
- ** 医药行业从业者**：了解 AI 辅助药物研发、临床试验等前沿动态
- ** 生物信息学工程师**：掌握计算生物学、生物AI工具的最新进展
- ** 对生命科学+AI 感兴趣的学习者**：系统了解交叉领域的发展趋势

---

##  快速开始

### 1. 部署到 Cloudflare Workers

\\\ash
# 克隆项目
git clone https://github.com/dongyu19920904/CloudFlare-BioAI-Daily.git
cd CloudFlare-BioAI-Daily

# 安装依赖
npm install

# 配置 wrangler.toml（修改 KV ID 等配置）

# 部署
npx wrangler deploy
\\\

### 2. 配置信息源

在 \wrangler.toml\ 中配置您的生命科学相关信息源 Feed IDs。

### 3. 设置 Secrets

\\\ash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put LOGIN_PASSWORD
\\\

---

## 项目源优化与验证流程（项目类 PROJECTS_API_URL）

### 优化目标
- 保持 **AI 生命科学**内容覆盖面，同时兼顾 **健康 AI 实用项目**（如 Claude-Ally-Health）。
- 结果更“新”（`sort=updated`）且有基础热度过滤（`stars:>50`），避免低质量噪音。

### 关键改动（最小改动版）
1) **支持多个 GitHub Search 查询合并**  
`PROJECTS_API_URL` 现在支持用 `|` 或换行分隔多个 URL。系统会依次抓取、合并去重。

2) **兼容 GitHub Search API 格式**  
支持 `{ items: [...] }` 结构并自动映射到统一字段，避免“格式不匹配”导致项目为空。

3) **GitHub 请求加 Header**  
自动加 `User-Agent`，如果配置了 `GITHUB_TOKEN` 会加 `Authorization`，减少限流问题。

### 推荐配置（双查询合并）
在 `wrangler.toml` 或 Cloudflare 环境变量中设置：

```
PROJECTS_API_URL = "https://api.github.com/search/repositories?q=bioinformatics+%22deep%20learning%22+stars:>50+archived:false&sort=updated&order=desc&per_page=50|https://api.github.com/search/repositories?q=health+ai+stars:>50+archived:false&sort=updated&order=desc&per_page=50"
```

### 运行验证流程（推荐 UI 操作）
1) 登录后台：`/login`
2) 抓取项目数据：点击“抓取并写入今日数据”（或双击“项目”分类按钮）
3) 选择项目条目并生成日报：`/genAIContent`
4) 点击“保存日报到 GitHub”：`/commitToGitHub`

### 常见问题
- **projectItemCount = 0**：检查 `PROJECTS_API_URL` 是否正确、是否有 `GITHUB_TOKEN` 以避免限流。
- **commitToGitHub 401**：更新 `GITHUB_TOKEN`（确保对目标仓库有写权限）。
- **/writeData 超时**：项目抓取 + 翻译耗时较长，等待更久或在浏览器 UI 操作。

---

##  License

MIT License
