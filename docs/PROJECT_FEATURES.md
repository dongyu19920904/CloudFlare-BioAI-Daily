# 项目特点总结与演进历史

> 本文档记录了"AI 资讯日报"项目的核心特点，以及从原始版本到当前版本的关键修改历程。
>
> **目的**：帮助你理解项目的设计理念和技术特点，为未来改造成其他垂直领域日报提供参考。

---

## 📌 第一部分：项目核心特点总结

### 1.1 技术架构特点

#### **☁️ Cloudflare Workers 无服务器架构**
- **零服务器维护成本**：无需购买和管理服务器，按需付费
- **全球边缘网络**：部署在 Cloudflare 的全球 CDN 节点，访问速度快
- **高可用性**：自动扩展，无需担心流量峰值
- **开发友好**：使用 Wrangler CLI 实现本地开发和一键部署

#### **🗄️ Cloudflare KV 存储**
- **持久化存储**：保存 Folo Cookie、生成的日报内容、配置信息
- **低延迟访问**：全球分布式键值存储，读取速度快
- **简单易用**：通过 `env.DATA_KV.get()` 和 `env.DATA_KV.put()` 操作

#### **🤖 多 AI 模型支持**
- **三大平台**：Google Gemini、OpenAI、Anthropic Claude
- **灵活切换**：通过 `USE_MODEL_PLATFORM` 环境变量一键切换
- **中转 API 支持**：支持自定义 API URL，可使用中转服务降低成本
- **智能降级**：Gemini 支持流式/非流式自动降级（`GEMINI_STREAM_MODE = "auto"`）
- **多版本兼容**：Gemini 支持 v1beta/v1/noversion 自动适配

**配置示例**（`wrangler.toml`）：
```toml
USE_MODEL_PLATFORM = "GEMINI"  # 或 "OPEN" / "ANTHROPIC"

# Gemini 配置
GEMINI_API_URL = "https://code.newcli.com/gemini"
DEFAULT_GEMINI_MODEL = "gemini-3-pro-preview"
GEMINI_STREAM_MODE = "auto"  # auto | off | force
GEMINI_API_VERSION = "auto"  # auto | v1beta | v1 | noversion

# OpenAI 配置
OPENAI_API_URL = "https://code.newcli.com/codex"
DEFAULT_OPEN_MODEL = "gpt-5.1"

# Claude 配置
ANTHROPIC_API_URL = "https://code.newcli.com/claude/aws"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
```

#### **🔄 GitHub Actions 自动化部署**
- **定时触发**：每日 00:00 UTC 生成日报，每周五 01:00 UTC 生成周报
- **自动构建**：使用 mdBook 或 Hugo 构建静态网站
- **自动发布**：推送到 GitHub Pages，无需手动操作
- **Docker 支持**：提供 Docker 部署方案，可部署到自己的服务器

---

### 1.2 内容生成特点

#### **📡 多数据源聚合**

项目支持 **12+ 数据源**，覆盖 AI 领域的各个方面：

| 数据源类型 | 具体来源 | 配置方式 |
|-----------|---------|---------|
| **新闻聚合** | Folo 多 Feed 聚合 | `FOLO_NEWS_IDS`（20+ Feed ID） |
| **学术论文** | HuggingFace Papers | `HGPAPERS_LIST_ID` |
| **开源项目** | GitHub Trending | `PROJECTS_API_URL` |
| **社交媒体** | Twitter、Reddit | `TWITTER_LIST_ID`、`REDDIT_LIST_ID` |
| **中文媒体** | AIBase、机器之心、量子位、新智元、小互 | 可选配置 |

**核心优势**：
- **Folo 优先**：只需配置 Folo Cookie，即可接入任意信息源
- **灵活扩展**：支持添加自定义数据源（参考 `docs/EXTENDING.md`）
- **智能去重**：自动去除重复内容
- **时间过滤**：通过 `FOLO_FILTER_DAYS` 控制抓取时间范围
- **数量控制**：通过 `MAX_ITEMS_PER_TYPE` 防止 prompt 过长

**当前配置**（`wrangler.toml` 第 51 行）：
```toml
FOLO_NEWS_IDS = "156937358802651136,106709235749293065,187702008979989514,..."
FOLO_NEWS_FETCH_PAGES = "1"
MAX_ITEMS_PER_TYPE = "50"
```

#### **🧠 AI 驱动的内容生成**

项目使用 AI 模型生成多种形式的内容：

| 内容类型 | 提示词文件 | 生成特点 |
|---------|-----------|---------|
| **日报正文** | `summarizationPromptStepZero.js` | 包含 TOP 10 深度解读、分类速览、全量索引 |
| **3 行摘要** | `summarizationPromptStepThree.js` | 极简风格，让读者快速判断是否点开 |
| **周报深度分析** | `weeklyBlogPrompt.js` | 提炼核心叙事线索，拒绝流水账 |
| **播客脚本** | `podcastFormattingPrompt.js` | 口语化表达，适合音频播报 |
| **每日分析** | `dailyAnalysisPrompt.js` | 3 句话总结今日大事 |

**生成流程**：
1. 从多个数据源抓取原始数据
2. 存储到 Cloudflare KV
3. 格式化为 prompt 友好的文本
4. 调用 AI 模型生成内容（支持多步骤生成）
5. 插入广告和页脚
6. 提交到 GitHub 仓库

#### **✍️ 提示词工程优化**

**核心创新**：应用 **"先想坑再开始"** 技巧（基于 Contrastive Chain-of-Thought 理论）

**原理**：让 AI 在生成内容前，先思考"如果做错了会是什么样"，把常见错误具象化，然后避开这些坑。

**优化效果**：
- ✅ 减少低质量输出（官腔、信息过载、逻辑混乱）
- ✅ 提升内容的可读性和连贯性
- ✅ 让 AI 更主动地进行质量控制

**示例**（`summarizationPromptStepZero.js` 第 11-25 行）：
```javascript
**⚠️ 开始前的自检（必须执行）：**

在动笔之前，先在脑海中快速过一遍：**"如果这篇日报写砸了，最可能踩哪些坑？"**

常见的坑包括但不限于：
- **信息过载**：没有筛选优先级，把所有素材都塞进去，读者看完一头雾水
- **用力过猛**：为了"人话"而刻意卖萌、堆砌网络梗，变成低俗网感或廉价幽默
- **技术黑话堆砌**：用一堆术语装专业（"多模态融合"、"端到端优化"），普通读者看不懂
- **孤立叙事**：每条新闻独立存在，缺乏连贯的故事线索，读起来像碎片拼盘
- **标题党过度**：为了吸引眼球过度夸张（"震惊！颠覆！"），失去可信度
- **格式错误**：链接忘记用 Markdown 格式，或者图片位置不对、滥用素材外的图片
- **内容重复**：TOP 10 和分类速览说的是同一件事，浪费读者时间
- **字数失控**：要求 80-150 字，结果写了 300 字的长篇大论

**现在，带着"避开这些坑"的意识，开始写作。**
```

**已优化的提示词**：
1. ✅ `summarizationPromptStepZero.js` - 日报生成（8 个坑）
2. ✅ `summarizationPromptStepThree.js` - 摘要生成（5 个坑）
3. ✅ `weeklyBlogPrompt.js` - 周报生成（7 个坑）
4. ✅ `podcastFormattingPrompt.js` - 播客脚本（7 个坑）
5. ✅ `dailyAnalysisPrompt.js` - 每日分析（6 个坑）

#### **🤝 人工筛选 + AI 生成的混合模式**

**设计理念**：AI 是增强人类智慧的工具，而非替代品。

**为什么需要手动勾选？**
- **保留人的判断力**：AI 或许能模仿你过去的喜好，却难以捕捉你此刻的灵感与洞见
- **思想的快照**：每一份日报都是你当日思考的真实快照
- **忒修斯之船**：今天的你和昨天的你在思想与关注点上已有细微不同

**工作流程**：
1. 用户登录后台（`/getContentHtml`）
2. 查看 AI 抓取的所有内容（按类型分类）
3. 手动勾选想要包含在日报中的内容
4. 点击"生成日报"，AI 根据选中的内容生成日报
5. 预览、编辑、提交到 GitHub

**当然，项目也支持全自动化**：
- 通过 Cron 定时任务自动生成（`wrangler.toml` 第 84 行）
- 社区开发者可以探索全自动筛选的实现方式

---

### 1.3 用户体验特点

#### **💬 "人话"风格，拒绝官腔**

**核心原则**：拒绝"说明书式"的废话，只说"人话"。

**具体体现**：
- ❌ 别说："该工具极大提高了工作效率。"
- ✅ 要说："以前要把这堆文档整理完得熬通宵，现在用这个工具，两分钟就能下班去吃火锅。"

- ❌ 别说："这是一个性能更强的模型。"
- ✅ 要说："就在大家以为 GPT-4 已经无敌的时候，这家名不见经传的小公司突然甩出了这个炸弹，跑分直接碾压。"

**写作指南**（`summarizationPromptStepZero.js` 第 20-32 行）：
1. **拒绝抽象，给我画面**
2. **制造冲突与反差**
3. **像朋友一样聊天**：用短句、第一人称、有情绪

#### **🎭 90/00 后中文互联网语境**

**目标受众**：16-35 岁的学生、开发者、创作者、AI 从业者

**语言特点**：
- 用第一人称（"我发现"、"咱们"）
- 可以有情绪（"太离谱了"、"笑死"、"这就很灵性"）
- 不要用公文腔（"据悉"、"旨在"、"具有重要意义" → 统统删掉！）
- 适量使用 Emoji，但别泛滥

**禁止的廉价网感词**：
- ❌ "家人们"、"绝绝子"、"yyds"
- ❌ "炸裂"、"跪了"、"成精了"（营销号语气）

#### **📱 多渠道发布**

| 渠道 | 链接/方式 | 特点 |
|------|----------|------|
| **网站** | [https://ai.hubtoday.app/](https://ai.hubtoday.app/) | 主站点，支持 PC 和移动端 |
| **RSS** | [RSS 订阅链接](https://justlovemaki.github.io/CloudFlare-AI-Insight-Daily/rss.xml) | 适合 Feedly、Inoreader、Folo 等阅读器 |
| **微信公众号** | 何夕2077 | 移动端阅读，每日推送 |
| **播客** | 小宇宙、抖音 | 音频版日报，适合通勤/做饭时听 |

---

## 📝 第二部分：从原项目到当前版本的关键修改

### 2.1 数据源配置修改

#### **原项目**
- 单一 Folo 列表（`NEWS_AGGREGATOR_LIST_ID`）
- 数据源较少，覆盖面有限

#### **你的改动**
- 配置了 **20+ 个 Folo Feed ID**（`FOLO_NEWS_IDS`）
- 覆盖更多 AI 信息源，内容更丰富

**改动位置**：`wrangler.toml` 第 51 行

**改动内容**：
```toml
# 原项目（单一列表）
NEWS_AGGREGATOR_LIST_ID = "220872364473472000"

# 你的改动（多 Feed 聚合）
FOLO_NEWS_IDS = "156937358802651136,106709235749293065,187702008979989514,103683660144768000,42034394558772224,63359584376654848,54889565031071744,41374113210459148,55136275384414208,41374113210459144,41373653871256584,76398619014644736,156897076257805312,71931642168770560,52357479509098509,52347176714948614,41147805268337669,59241875117740032,126876190047292418,43254215382531115"
```

**优势**：
- ✅ 更灵活：无需创建 Folo 列表，直接配置 Feed ID
- ✅ 更全面：覆盖更多信息源，减少遗漏
- ✅ 易维护：新增/删除信息源只需修改一行配置

---

### 2.2 AI 模型配置修改

#### **原项目**
- 可能只支持 Google Gemini
- 使用官方 API URL

#### **你的改动**
- 支持 **三大模型平台**（Gemini、OpenAI、Claude）
- 使用 **中转 API**（`code.newcli.com`）
- 配置了 **最新模型**（gemini-3-pro-preview、gpt-5.1、claude-sonnet-4）

**改动位置**：`wrangler.toml` 第 14-29 行

**改动内容**：
```toml
USE_MODEL_PLATFORM = "GEMINI"  # 一键切换平台

# Gemini 配置（使用中转）
GEMINI_API_URL = "https://code.newcli.com/gemini"
DEFAULT_GEMINI_MODEL = "gemini-3-pro-preview"
GEMINI_STREAM_MODE = "auto"
GEMINI_API_VERSION = "auto"

# OpenAI 配置（使用中转）
OPENAI_API_URL = "https://code.newcli.com/codex"
DEFAULT_OPEN_MODEL = "gpt-5.1"

# Claude 配置（使用中转）
ANTHROPIC_API_URL = "https://code.newcli.com/claude/aws"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
```

**优势**：
- ✅ 降低成本：中转 API 通常比官方便宜
- ✅ 提高稳定性：多平台备份，一个挂了可以切换
- ✅ 使用最新模型：及时跟进 AI 技术发展

---

### 2.3 提示词优化

#### **原项目**
- 基础提示词，直接告诉 AI 要做什么
- 缺少预防性思考环节

#### **你的改动**
- 应用 **"先想坑再开始"** 技巧
- 优化了 **5 个核心提示词**
- 每个提示词都增加了"常见错误列表"

**改动文件**：
1. `src/prompt/summarizationPromptStepZero.js` - 日报生成
2. `src/prompt/summarizationPromptStepThree.js` - 摘要生成
3. `src/prompt/weeklyBlogPrompt.js` - 周报生成
4. `src/prompt/podcastFormattingPrompt.js` - 播客脚本
5. `src/prompt/dailyAnalysisPrompt.js` - 每日分析

**改动示例**（以日报生成为例）：

**原项目**：
```javascript
你是一个资深观察者。
你的核心原则：拒绝"说明书式"的废话，只说"人话"。
```

**你的改动**：
```javascript
你是一个资深观察者。
你的核心原则：拒绝"说明书式"的废话，只说"人话"。

---

**⚠️ 开始前的自检（必须执行）：**

在动笔之前，先在脑海中快速过一遍：**"如果这篇日报写砸了，最可能踩哪些坑？"**

常见的坑包括但不限于：
- **信息过载**：没有筛选优先级，把所有素材都塞进去，读者看完一头雾水
- **用力过猛**：为了"人话"而刻意卖萌、堆砌网络梗，变成低俗网感或廉价幽默
- **技术黑话堆砌**：用一堆术语装专业（"多模态融合"、"端到端优化"），普通读者看不懂
- **孤立叙事**：每条新闻独立存在，缺乏连贯的故事线索，读起来像碎片拼盘
- **标题党过度**：为了吸引眼球过度夸张（"震惊！颠覆！"），失去可信度
- **格式错误**：链接忘记用 Markdown 格式，或者图片位置不对、滥用素材外的图片
- **内容重复**：TOP 10 和分类速览说的是同一件事，浪费读者时间
- **字数失控**：要求 80-150 字，结果写了 300 字的长篇大论

**现在，带着"避开这些坑"的意识，开始写作。**

---
```

**优势**：
- ✅ 减少低质量输出
- ✅ 提升内容连贯性
- ✅ 让 AI 更主动地质量控制

---

### 2.4 品牌定制化

#### **原项目**
- 通用名称（"AI 洞察日报"）
- 通用播客开场白

#### **你的改动**
- 品牌名称：**爱窝啦 AI 日报**
- 播客品牌：**爱窝啦播报**
- 广告文案：动态化模型名称（不写死版本号）

**改动位置**：`wrangler.toml` 第 73-81 行，`src/ad.js` 第 18 行

**改动内容**：

**`wrangler.toml`**：
```toml
DAILY_TITLE = "爱窝啦 AI 日报"
DAILY_TITLE_MIN = " `AI 日报` "
PODCAST_TITLE = "爱窝啦播报"
PODCAST_BEGIN = "欢迎收听爱窝啦 AI 日报，每天为你精选 AI 领域最值得关注的动态"
PODCAST_END = "感谢收听，我们下期再见"
INSERT_AD = "true"
INSERT_APP_URL = "<h3>[查看完整版 AI 日报 ↗️](https://news.aivora.cn)</h3>"
```

**`src/ad.js`**：
```javascript
// 原项目（写死版本号）
const MID_SOFT_AD = `想第一时间体验文中提到的 Claude 3.5 或 GPT-4o？`;

// 你的改动（动态化）
const MID_SOFT_AD = `想第一时间体验文中提到的最新 AI 模型（Claude、GPT、Gemini）？`;
```

**优势**：
- ✅ 品牌一致性：所有渠道使用统一品牌名称
- ✅ 永不过时：广告文案不写死版本号，AI 模型更新后无需修改

---

### 2.5 GitHub 发布配置

#### **原项目**
- 可能使用 mdBook 构建
- 发布到默认仓库

#### **你的改动**
- 使用 **Hugo + Hextra 主题**（2.0 版本）
- 发布到自定义仓库：`dongyu19920904/Hextra-AI-Insight-Daily`
- 主站点：[https://ai.hubtoday.app/](https://ai.hubtoday.app/)

**改动位置**：`wrangler.toml` 第 68-70 行

**改动内容**：
```toml
GITHUB_REPO_OWNER = "dongyu19920904"
GITHUB_REPO_NAME = "Hextra-AI-Insight-Daily"
GITHUB_BRANCH = "main"
```

**前端项目**：
- 仓库：[Hextra-AI-Insight-Daily](https://github.com/justlovemaki/Hextra-AI-Insight-Daily)
- 技术栈：Hugo + Hextra 主题
- 特点：现代化设计、响应式布局、搜索功能

---

### 2.6 其他细节优化

#### **图片代理**
```toml
IMG_PROXY = ""  # 可配置图片代理，解决图片不显示问题
```

#### **翻译功能**
```toml
OPEN_TRANSLATE = "true"  # 开启内容翻译
```

#### **页脚和广告**
```toml
INSERT_FOOT = "false"  # 是否插入页脚
INSERT_AD = "true"      # 是否插入广告
```

#### **数量控制**
```toml
MAX_ITEMS_PER_TYPE = "50"  # 每类内容最多抓取 50 条
```

---

## 🎯 总结

### 核心优势

1. **技术先进**：Cloudflare Workers + 多 AI 模型 + GitHub Actions
2. **内容优质**：多数据源聚合 + 提示词工程优化 + 人工筛选
3. **用户友好**："人话"风格 + 多渠道发布 + 响应式设计
4. **高度可扩展**：模块化架构，易于添加新数据源和新功能

### 关键创新

1. **"先想坑再开始"提示词技巧**：显著提升 AI 输出质量
2. **人工筛选 + AI 生成混合模式**：保留人的判断力
3. **多 AI 模型支持 + 中转 API**：降低成本，提高稳定性
4. **Folo 多 Feed 聚合**：灵活配置，覆盖更多信息源

### 适用场景

- ✅ AI 领域日报（当前）
- ✅ 其他垂直领域日报（Web3、游戏、投资、生命科学等）
- ✅ 个人信息聚合平台
- ✅ 内容创作者的素材库

---

**下一步**：阅读 [快速定制指南](QUICK_CUSTOMIZATION_GUIDE.md)，了解如何将项目改造成其他垂直领域的日报。
