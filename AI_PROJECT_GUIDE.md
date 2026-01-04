#  BioAI 生命科学日报 - AI 开发指南

> 本文档供 AI 助手阅读，了解项目背景、目标和配置方法。

---

##  项目背景

本项目是从 **AI 资讯日报** 项目复制而来，原项目用于聚合 AI 行业新闻。

| 原项目 | 新项目 |
|--------|--------|
| CloudFlare-AI-Insight-Daily (后端) | CloudFlare-BioAI-Daily (后端) |
| Hextra-AI-Insight-Daily (前端) | BioAI-Daily-Web (前端) |

**GitHub 仓库：**
- 后端：https://github.com/dongyu19920904/CloudFlare-BioAI-Daily
- 前端：https://github.com/dongyu19920904/BioAI-Daily-Web

---

##  用户目标

将原来的 **AI 资讯日报** 改造成 **AI + 生命科学日报**，聚焦以下领域：

1. **AI 辅助药物研发** - AI 在新药发现、分子设计中的应用
2. **蛋白质结构预测** - AlphaFold 等蛋白质预测工具进展
3. **基因编辑与 CRISPR** - 基因治疗、CRISPR 技术突破
4. **生物信息学** - 计算生物学、基因组学分析
5. **医学影像 AI** - AI 在医学诊断、影像分析中的应用
6. **数字健康** - 可穿戴设备、健康监测 AI
7. **合成生物学** - AI 在生物工程中的应用

---

##  后端配置说明 (Cloudflare Workers)

### 关键配置文件：wrangler.toml

#### 1. KV 存储配置（必须修改）
`	oml
kv_namespaces = [
  { binding = "DATA_KV", id = "YOUR_KV_ID_HERE" }  # 需要替换为新建的 KV ID
]
`

#### 2. GitHub 仓库配置（已修改）
`	oml
GITHUB_REPO_OWNER = "dongyu19920904"
GITHUB_REPO_NAME = "BioAI-Daily-Web"  # 指向前端仓库
GITHUB_BRANCH = "main"
`

#### 3. 日报标题配置（已修改）
`	oml
DAILY_TITLE = "BioAI 生命科学日报"
DAILY_TITLE_MIN = " BioAI 生命科学日报 "
PODCAST_TITLE = "BioAI 生命科学播报"
PODCAST_BEGIN = "欢迎收听 BioAI 生命科学日报，每天为你精选 AI 与生命科学领域最值得关注的动态"
PODCAST_END = "感谢收听，我们下期再见"
`

#### 4. 信息源配置（需要配置）
`	oml
# 主要信息源 - 需要在 Folo 上订阅生命科学相关 RSS 后获取 feedId
FOLO_NEWS_IDS = ""  # 填入逗号分隔的 feedId 列表

# HuggingFace Papers - 可以配置生物医学相关的论文源
HGPAPERS_LIST_ID = ""

# GitHub Trending - 可以配置生物信息学相关项目
PROJECTS_API_URL = ""
`

#### 5. Secrets 配置（通过命令行设置）
`ash
npx wrangler secret put ANTHROPIC_API_KEY    # AI 模型 API Key
npx wrangler secret put GITHUB_TOKEN         # GitHub 访问令牌
npx wrangler secret put LOGIN_PASSWORD       # 登录密码
`

---

##  前端配置说明 (Hugo + Hextra)

### 关键配置文件：hugo.yaml

#### 已完成的修改：
- title: "BioAI 生命科学日报"
- baseURL: GitHub Pages 地址
- description: 生命科学相关描述
- 菜单项已调整

#### 可能需要修改的内容：
1. **Logo 图片** - static/images/logo.png 和 logo-dark.png
2. **Favicon** - static/favicon.ico 和 avicon.svg
3. **关于页面** - content/cn/about.md
4. **首页内容** - content/cn/_index.md
5. **自定义域名** - static/CNAME

---

##  推荐的生命科学信息源

### RSS 订阅源建议（可在 Folo 上订阅）

| 类别 | 来源 | 说明 |
|------|------|------|
| **学术论文** | Nature Biotechnology | 生物技术顶刊 |
| **学术论文** | Cell | 细胞生物学顶刊 |
| **学术论文** | bioRxiv | 生物学预印本 |
| **学术论文** | medRxiv | 医学预印本 |
| **AI+Bio** | DeepMind Blog | AlphaFold 等进展 |
| **行业新闻** | STAT News | 生命科学行业新闻 |
| **行业新闻** | Endpoints News | 生物制药新闻 |
| **行业新闻** | Fierce Biotech | 生物科技行业 |
| **中文媒体** | 生物谷 | 中文生物医药资讯 |
| **中文媒体** | 药明康德 | 医药研发资讯 |

### HuggingFace 相关
- 搜索 "biology", "protein", "drug", "genomics" 相关模型和论文

### GitHub Trending
- 关注 bioinformatics, computational-biology, drug-discovery 等标签

---

##  部署步骤

### 后端部署
1. 在 Cloudflare Dashboard 创建 KV 命名空间
2. 更新 wrangler.toml 中的 KV ID
3. 配置 Secrets
4. 运行 
px wrangler deploy

### 前端部署
1. 进入 GitHub 仓库 Settings  Pages
2. Source 选择 "GitHub Actions"
3. 等待自动构建完成
4. 访问 https://dongyu19920904.github.io/BioAI-Daily-Web/

---

##  待修改清单

- [ ] 创建 Cloudflare KV 并更新 ID
- [ ] 配置 AI API Key (ANTHROPIC_API_KEY)
- [ ] 配置 GitHub Token
- [ ] 在 Folo 订阅生命科学信息源并获取 feedId
- [ ] 更新 FOLO_NEWS_IDS 配置
- [ ] 修改前端 Logo 和 Favicon
- [ ] 更新关于页面内容
- [ ] 清理旧的 AI 资讯内容
- [ ] 启用 GitHub Pages
- [ ] 测试定时任务生成日报

---

##  相关链接

- Cloudflare Dashboard: https://dash.cloudflare.com/
- Folo (RSS 聚合): https://app.follow.is/
- Hugo 文档: https://gohugo.io/documentation/
- Hextra 主题: https://imfing.github.io/hextra/
