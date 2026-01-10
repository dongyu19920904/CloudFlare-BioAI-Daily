QUICK_CUSTOMIZATION_GUIDE.md

# 快速定制指南：将项目改造成其他垂直领域日报

> 本文档提供详细的步骤清单，帮助你快速将"AI 资讯日报"项目改造成其他垂直领域（如 AI 生命科学、Web3、游戏等）的日报站点。
>
> **前置阅读**：建议先阅读 [项目特点总结](PROJECT_FEATURES.md) 了解项目的核心特点。

---

## 📋 第三部分：快速改造清单

### 3.1 必改项（核心配置）

这些是**必须修改**的配置，否则项目无法正常运行或会发布到错误的位置。

| 序号 | 配置项 | 文件位置 | 当前值（AI 日报） | 示例值（AI 生命科学日报） | 说明 |
|------|--------|---------|------------------|------------------------|------|
| 1 | Worker 名称 | `wrangler.toml` 第 2 行 | `cloudflare-ai-lnsight-daily` | `ai-lifescience-daily` | Cloudflare Workers 的项目名称 |
| 2 | 日报标题 | `wrangler.toml` 第 73 行 | `爱窝啦 AI 日报` | `AI 生命科学日报` | 显示在页面顶部的标题 |
| 3 | 日报标题（简短版） | `wrangler.toml` 第 74 行 | ` \`AI 日报\` ` | ` \`生命科学日报\` ` | 用于某些简短显示场景 |
| 4 | 播客标题 | `wrangler.toml` 第 75 行 | `爱窝啦播报` | `生命科学播报` | 播客节目名称 |
| 5 | 播客开场白 | `wrangler.toml` 第 76 行 | `欢迎收听爱窝啦 AI 日报...` | `欢迎收听 AI 生命科学日报...` | 播客开头的固定台词 |
| 6 | 播客结束语 | `wrangler.toml` 第 77 行 | `感谢收听，我们下期再见` | `感谢收听，我们下期再见` | 播客结尾的固定台词 |
| 7 | GitHub 仓库所有者 | `wrangler.toml` 第 68 行 | `dongyu19920904` | `your-username` | 你的 GitHub 用户名 |
| 8 | GitHub 仓库名称 | `wrangler.toml` 第 69 行 | `Hextra-AI-Insight-Daily` | `AI-LifeScience-Daily` | 用于发布日报的 GitHub 仓库名 |
| 9 | GitHub 分支 | `wrangler.toml` 第 70 行 | `main` | `main` | 发布到哪个分支 |
| 10 | Folo Feed IDs | `wrangler.toml` 第 51 行 | `156937358802651136,106709...` | `替换成生命科学相关的 Feed ID` | 数据源配置（最重要！） |

**操作步骤**：
1. 打开 `wrangler.toml` 文件
2. 按照上表逐行修改配置
3. 保存文件

---

### 3.2 提示词修改（内容风格）

这些提示词决定了 AI 生成内容的风格和质量。**保留"先想坑"的结构**，只需替换领域相关的描述和示例。

#### **修改清单**

| 文件 | 需要修改的内容 | 改造要点 | 优先级 |
|------|---------------|---------|--------|
| `summarizationPromptStepZero.js` | 角色定位、写作指南、示例 | 将"AI 圈观察者"改为"生命科学观察者" | 🔴 高 |
| `summarizationPromptStepThree.js` | 摘要示例 | 替换成生命科学领域的示例 | 🟡 中 |
| `weeklyBlogPrompt.js` | 角色定位、写作风格 | 调整为生命科学专栏作家 | 🟡 中 |
| `podcastFormattingPrompt.js` | 目标受众、播客风格 | 调整为生命科学从业者 | 🟢 低 |
| `dailyAnalysisPrompt.js` | 筛选标准、示例 | 替换成生命科学领域的示例 | 🟢 低 |

#### **详细修改指南**

##### **1. summarizationPromptStepZero.js（日报生成）- 🔴 高优先级**

**文件位置**：`src/prompt/summarizationPromptStepZero.js`

**需要修改的部分**：

**第 4-5 行**（角色定位）：
```javascript
// 原文
你不是一个只会转发新闻的机器人，你是一个**有血有肉、在 AI 圈摸爬滚打多年的资深观察者**。
现在是深夜，你刚整理完一天的情报，正迫不及待地想跟你的朋友（读者）分享今天最让他震惊、最有用、或者最离谱的 AI 动态。

// 改为（AI 生命科学）
你不是一个只会转发新闻的机器人，你是一个**有血有肉、在生命科学领域深耕多年的资深观察者**。
现在是深夜，你刚整理完一天的情报，正迫不及待地想跟你的朋友（读者）分享今天最让他震惊、最有用、或者最离谱的生命科学动态。
第 18-19 行（技术黑话示例）：

// 原文
- **技术黑话堆砌**：用一堆术语装专业（"多模态融合"、"端到端优化"），普通读者看不懂

// 改为（AI 生命科学）
- **技术黑话堆砌**：用一堆术语装专业（"基因编辑"、"蛋白质折叠"、"CRISPR-Cas9"），普通读者看不懂
第 21-26 行（写作示例）：

// 原文
❌ 别说："该工具极大提高了工作效率。"
✅ 要说："**以前要把这堆文档整理完得熬通宵，现在用这个工具，两分钟就能下班去吃火锅。**"

❌ 别说："这是一个性能更强的模型。"
✅ 要说："**就在大家以为 GPT-4 已经无敌的时候，这家名不见经传的小公司突然甩出了这个炸弹，跑分直接碾压。**"

// 改为（AI 生命科学）
❌ 别说："该技术显著提高了药物研发效率。"
✅ 要说："**以前筛选一个候选药物要花 5 年，现在用这个 AI 模型，3 个月就能锁定目标，制药公司都疯了。**"

❌ 别说："这是一个更精准的诊断方法。"
✅ 要说："**就在大家以为癌症早筛已经到极限的时候，这个团队突然甩出了这个技术，准确率直接从 70% 飙到 95%。**"
⚠️ 重要：保留第 11-25 行的"先想坑"结构，不要删除！
2. summarizationPromptStepThree.js（摘要生成）- 🟡 中优先级
文件位置：src/prompt/summarizationPromptStepThree.js 需要修改的部分： 第 20-23 行（示例）：

// 原文
**示例：**
OpenAI 发布 GPT-5，多模态能力炸裂，速度快 3 倍且价格不变。
GitHub 上出现一款修图神器，一键自动补全画面，设计师狂喜。
今天的 AI 圈神仙打架，建议重点关注前两条新闻，赶紧去试用！

// 改为（AI 生命科学）
**示例：**
Nature 发表突破性研究，AI 预测蛋白质结构准确率达 98%，药物研发周期缩短一半。
FDA 批准首个 AI 辅助诊断系统，肺癌早筛准确率提升至 95%，临床应用加速。
今天的生命科学圈重磅频出，建议重点关注前两条新闻，可能改变行业格局！
3. weeklyBlogPrompt.js（周报生成）- 🟡 中优先级
文件位置：src/prompt/weeklyBlogPrompt.js 需要修改的部分： 第 4-5 行（角色定位）：

// 原文
你是一位**眼光独到的科技专栏作家**，你的读者是一群聪明、好奇但时间紧迫的 AI 关注者。
你将收到过去一周的 AI 日报内容。你的任务不是"做拼盘"，而是**"穿针引线"**--从碎片化的信息中找出本周的**核心叙事线索**。

// 改为（AI 生命科学）
你是一位**眼光独到的科技专栏作家**，你的读者是一群聪明、好奇但时间紧迫的生命科学关注者。
你将收到过去一周的生命科学日报内容。你的任务不是"做拼盘"，而是**"穿针引线"**--从碎片化的信息中找出本周的**核心叙事线索**。
第 30 行（示例）：

// 原文
**观点优先**：不要只告诉我发生了什么，要告诉我**这意味着什么**。比如："Google 这一招不是为了赢，而是为了不输。"

// 改为（AI 生命科学）
**观点优先**：不要只告诉我发生了什么，要告诉我**这意味着什么**。比如："这个技术的突破不是为了发论文，而是为了真正解决临床问题。"
4. podcastFormattingPrompt.js（播客脚本）- 🟢 低优先级
文件位置：src/prompt/podcastFormattingPrompt.js 需要修改的部分： 第 13-15 行（目标受众和风格）：

// 原文
你是个会讲故事的 AI 科技播客主播，给 Z 世代听众讲今天 AI 圈发生的有趣事儿。
目标受众：16-25 岁的学生、开发者、创作者（通勤/做饭/睡前听）

// 改为（AI 生命科学）
你是个会讲故事的生命科学播客主播，给医学、生物学从业者和爱好者讲今天生命科学领域发生的重要事儿。
目标受众：25-45 岁的医生、研究者、制药从业者、生物技术爱好者（通勤/做饭/睡前听）
第 28 行（技术黑话示例）：

// 原文
- **技术黑话未翻译**：直接说"多模态融合"、"端到端优化"而不解释，听众听不懂就跳过了

// 改为（AI 生命科学）
- **技术黑话未翻译**：直接说"基因编辑"、"蛋白质折叠"、"CRISPR-Cas9"而不解释，听众听不懂就跳过了
5. dailyAnalysisPrompt.js（每日分析）- 🟢 低优先级
文件位置：src/prompt/dailyAnalysisPrompt.js 需要修改的部分： 第 3-5 行（角色定位）：

// 原文
你是个极简主义的 AI 观察者。你的任务是从今天的资讯中，挑出 **3 件** 最值得开发者或从业者关注的大事。
**核心目标：用 3 句"人话"，让人秒懂今天 AI 圈发生了什么。**

// 改为（AI 生命科学）
你是个极简主义的生命科学观察者。你的任务是从今天的资讯中，挑出 **3 件** 最值得医生、研究者或从业者关注的大事。
**核心目标：用 3 句"人话"，让人秒懂今天生命科学领域发生了什么。**
第 24-27 行（示例）：

// 原文
✅ **好：**
1. OpenAI 发布 GPT-5 Turbo，推理速度提升 3 倍，API 价格下调 50%，开发者狂喜。
2. Meta 开源 Llama-4 70B，在代码生成任务上首次超越闭源模型，本地运行门槛进一步降低。
3. Google DeepMind 推出新一代机器人控制算法，让双足机器人学会了跑酷，动作流畅度提升明显。

// 改为（AI 生命科学）
✅ **好：**
1. Nature 发表突破性研究，AI 预测蛋白质结构准确率达 98%，药物研发周期有望缩短一半。
2. FDA 批准首个 AI 辅助诊断系统，肺癌早筛准确率提升至 95%，临床应用进入快车道。
3. 中国团队开发新型基因编辑技术，脱靶率降低 90%，安全性大幅提升，临床试验即将启动。
3.3 数据源配置（内容来源）
这是最关键的部分，决定了日报的内容质量和覆盖面。
步骤 1：在 Folo 中订阅生命科学相关的信息源
推荐信息源类型：
类型	推荐来源	说明
学术期刊	Nature、Science、Cell、NEJM、Lancet	顶级期刊的最新研究
行业媒体	生物谷、丁香园、医学界、药明康德	中文行业资讯
国际媒体	STAT News、FierceBiotech、BioSpace	英文行业资讯
监管机构	FDA、EMA、NMPA	药物审批和监管动态
公司动态	辉瑞、诺华、罗氏、Moderna 等	制药公司官方新闻
社交媒体	Twitter 上的生命科学专家	行业专家的观点和讨论
操作步骤：
打开 Folo
搜索并订阅上述信息源
记录每个信息源的 Feed ID
步骤 2：获取 Feed ID
方法 1：从 URL 中提取
在 Folo 中打开订阅源
查看浏览器地址栏，格式为：https://app.follow.is/feed/[Feed ID]
复制 Feed ID（一串数字）
方法 2：从开发者工具中提取
按 F12 打开开发者工具
切换到 Network 标签
刷新页面，查找 API 请求
在请求参数中找到 feedId
示例：

https://app.follow.is/feed/156937358802651136↑
                         这就是 Feed ID
步骤 3：配置到 wrangler.toml
打开 wrangler.toml 文件，找到第 51 行，将所有 Feed ID 用逗号分隔，填入 FOLO_NEWS_IDS：

# 原配置（AI 日报）
FOLO_NEWS_IDS = "156937358802651136,106709235749293065,187702008979989514,..."

# 新配置（AI 生命科学日报）
FOLO_NEWS_IDS = "123456789012345678,234567890123456789,345678901234567890,..."
⚠️ 注意：
Feed ID 之间用英文逗号分隔
不要有空格
建议配置 15-30 个 Feed ID，覆盖不同类型的信息源
步骤 4：调整抓取参数（可选）

# 每个 Feed 抓取的页数（每页约 20 条）
FOLO_NEWS_FETCH_PAGES = "1"  # 建议保持 1，避免内容过多

# 过滤天数（只抓取最近 N 天的内容）
FOLO_FILTER_DAYS = 1  # 建议保持 1

# 每类内容的最大数量（防止 prompt 过长）
MAX_ITEMS_PER_TYPE = "50"  # 可根据需要调整
3.4 广告和页脚（品牌信息）
如果你有自己的品牌或广告，需要修改这两个文件。
1. 修改广告文案
文件位置：src/ad.js 需要修改的部分： 第 5-15 行（页尾广告）：

// 原文
export function insertAd() {
    return `
---

## **AI 账号极速发货: [爱窝啦 Aivora ⬆️](https://aivora.cn)**

还在为 ChatGPT Plus、Claude Pro、Midjourney 的支付问题烦恼？**爱窝啦 Aivora** 为您提供一站式 AI 账号解决方案！

✅ **极速发货**：下单即发，无需等待，即刻开启 AI 之旅。
✅ **稳定可靠**：精选优质独享账号，拒绝封号焦虑，售后无忧。
✅ **超全品类**：ChatGPT Plus、Claude Pro、Midjourney、Poe、Sunno 等热门 AI 工具账号应有尽有。
✅ **超高性价比**：比官方订阅更优惠的价格，享受同等尊贵服务。

🚀 **立即访问 [aivora.cn](https://aivora.cn) 选购您的 AI 助手，释放无限创造力！**`;
}

// 改为（AI 生命科学）- 如果没有广告，可以删除或留空
export function insertAd() {
    return `
---

## **关注我们**

想了解更多生命科学前沿动态？关注我们的公众号：**生命科学日报**

📱 微信搜索：生命科学日报
🌐 网站：https://your-website.com
    `;
}
第 18 行（中插广告）：

// 原文
const MID_SOFT_AD = `> 💡 **提示**：想第一时间体验文中提到的最新 AI 模型（Claude、GPT、Gemini）？没有账号？来 [**爱窝啦 Aivora**](https://aivora.cn?utm_source=daily_news&utm_medium=mid_ad&utm_campaign=content) 领个号，一分钟上手，售后无忧。`;

// 改为（AI 生命科学）- 如果没有广告，可以留空
const MID_SOFT_AD = `> 💡 **提示**：想深入了解文中提到的研究？访问 [**生命科学日报**](https://your-website.com) 获取完整解读。`;
⚠️ 如果不需要广告：
在 wrangler.toml 第 80 行设置 INSERT_AD = "false"
或者将广告内容留空
2. 修改页脚信息
文件位置：src/foot.js 需要修改的部分：

// 原文
export function insertFoot() {
    return `

---

## **AI资讯日报语音版**

| 🎙️ **小宇宙** | 📹 **抖音** |
| --- | --- |
| [来生小酒馆](https://www.xiaoyuzhoufm.com/podcast/683c62b7c1ca9cf575a5030e)  |   [自媒体账号](https://www.douyin.com/user/MS4wLjABAAAAwpwqPQlu38sO38VyWgw9ZjDEnN4bMR5j8x111UxpseHR9DpB6-CveI5KRXOWuFwG)| 
| ![小酒馆](https://cdn.jsdmirror.com/gh/justlovemaki/imagehub@main/logo/f959f7984e9163fc50d3941d79a7f262.md.png) | ![情报站](https://cdn.jsdmirror.com/gh/justlovemaki/imagehub@main/logo/7fc30805eeb831e1e2baa3a240683ca3.md.png) |`;
}

// 改为（AI 生命科学）
export function insertFoot() {
    return `

---

## **关注我们**

📱 **微信公众号**：生命科学日报  
🌐 **官方网站**：https://your-website.com  
📧 **联系邮箱**：contact@your-website.com

    `;
}
⚠️ 如果不需要页脚：
在 wrangler.toml 第 79 行设置 INSERT_FOOT = "false"
3.5 前端部署（可选）
如果你使用 Hugo + Hextra 主题或 mdBook 构建前端，需要修改相应的配置文件。
Hugo + Hextra 主题
文件位置：前端仓库的 config.yaml 或 hugo.toml 需要修改的部分：

# 原配置
title: "AI 资讯日报"
baseURL: "https://ai.hubtoday.app/"

# 新配置
title: "AI 生命科学日报"
baseURL: "https://your-domain.com/"
mdBook
文件位置：book.toml 需要修改的部分：

# 原配置
[book]
title = "AI 资讯日报"
authors = ["爱窝啦"]

[output.html]
git-repository-url = "https://github.com/dongyu19920904/Hextra-AI-Insight-Daily"

# 新配置
[book]
title = "AI 生命科学日报"
authors = ["Your Name"]

[output.html]
git-repository-url = "https://github.com/your-username/AI-LifeScience-Daily"
📌 第四部分：不需要改的部分
这些是项目的核心逻辑，除非你要添加新功能，否则不需要修改：
4.1 核心逻辑文件（保持不变）
文件	功能	是否需要改
src/dataFetchers.js	数据抓取和聚合逻辑	❌ 不需要
src/chatapi.js	AI 模型调用逻辑	❌ 不需要
src/github.js	GitHub 发布逻辑	❌ 不需要
src/auth.js	认证逻辑	❌ 不需要
src/index.js	路由和调度逻辑	❌ 不需要
src/helpers.js	工具函数	❌ 不需要
4.2 提示词的"先想坑"结构（保留）
重要：所有提示词中的"先想坑"结构都要保留，只需修改具体的示例和描述。 保留的部分：

**⚠️ 开始前的自检（必须执行）：**

在动笔之前，先在脑海中快速过一遍：**"如果这篇日报写砸了，最可能踩哪些坑？"**

常见的坑包括但不限于：
- ...（这里的具体内容可以根据领域调整）

**现在，带着"避开这些坑"的意识，开始写作。**
🚀 第五部分：改造步骤清单
准备阶段
 Fork 或复制当前项目到新仓库
 在 Folo 中订阅新领域的信息源（15-30 个）
 记录所有 Feed ID
 准备新的 GitHub 仓库（用于发布日报）
 在 Cloudflare 创建新的 KV 命名空间
配置阶段（30 分钟）
 修改 wrangler.toml 中的项目名称（第 2 行）
 修改 wrangler.toml 中的日报标题和播客信息（第 73-77 行）
 修改 wrangler.toml 中的 GitHub 仓库配置（第 68-70 行）
 替换 wrangler.toml 中的 FOLO_NEWS_IDS（第 51 行）
 更新 KV 命名空间 ID（第 8 行）
内容定制阶段（1-2 小时）
 修改 summarizationPromptStepZero.js（角色定位、示例）
 修改 summarizationPromptStepThree.js（摘要示例）
 修改 weeklyBlogPrompt.js（角色定位、示例）
 修改 podcastFormattingPrompt.js（目标受众、示例）
 修改 dailyAnalysisPrompt.js（角色定位、示例）
 修改 src/ad.js（广告文案）
 修改 src/foot.js（页脚信息）
测试阶段（30 分钟）
 本地运行 wrangler dev 测试
 访问 /getContentHtml 查看数据抓取是否正常
 手动触发一次内容生成，检查输出质量
 检查提示词是否生效（是否避开了常见的坑）
 调整提示词直到满意
部署阶段（15 分钟）
 设置 Cloudflare Secrets（API Keys）```bash wrangler secret putGEMINI_API_KEYwrangler secret put OPENAI_API_KEY
  wrangler secret put ANTHROPIC_API_KEY
  wrangler secret put GITHUB_TOKEN
  wrangler secret put LOGIN_PASSWORD
 部署到 Cloudflare Workers```bash wrangler deploy

 在 Cloudflare 控制台检查部署状态（Deployments → Build logs）
 配置 GitHub Actions（如果使用自动化部署）
 验证自动化流程（等待 Cron 触发或手动触发）
验证阶段（15 分钟）
 访问 Worker URL，检查是否正常运行
 查看生成的日报内容，检查格式和质量
 检查 GitHub 仓库，确认文件已提交
 访问 GitHub Pages，查看前端展示效果
 测试 RSS 订阅是否正常
🎯 第六部分：AI 生命科学日报示例配置
完整配置示例
wrangler.toml 关键配置

name = 'ai-lifescience-daily'
main = "src/index.js"
compatibility_date = "2025-05-20"
workers_dev = true

kv_namespaces = [
  { binding = "DATA_KV", id = "your-kv-namespace-id" }
]

[vars]
# AI 模型配置
USE_MODEL_PLATFORM = "GEMINI"
GEMINI_API_URL = "https://code.newcli.com/gemini"
DEFAULT_GEMINI_MODEL = "gemini-3-pro-preview"
GEMINI_STREAM_MODE = "auto"
GEMINI_API_VERSION = "auto"

# GitHub 配置
GITHUB_REPO_OWNER = "your-username"
GITHUB_REPO_NAME = "AI-LifeScience-Daily"
GITHUB_BRANCH = "main"

# 品牌配置
DAILY_TITLE = "AI 生命科学日报"
DAILY_TITLE_MIN = " `生命科学日报` "
PODCAST_TITLE = "生命科学播报"
PODCAST_BEGIN = "欢迎收听 AI 生命科学日报，每天为你精选生命科学领域最值得关注的动态"
PODCAST_END = "感谢收听，我们下期再见"

# 数据源配置（示例 Feed ID，需替换成真实的）
FOLO_NEWS_IDS = "123456789012345678,234567890123456789,345678901234567890"
FOLO_NEWS_FETCH_PAGES = "1"
FOLO_FILTER_DAYS = 1
MAX_ITEMS_PER_TYPE = "50"

# 广告和页脚
INSERT_AD = "false"
INSERT_FOOT = "false"

# 登录配置
LOGIN_USERNAME = "admin"
# LOGIN_PASSWORD 通过 wrangler secret 设置

[triggers]
crons = ["0 0 * * *", "0 1 * * 5"]
推荐的 Folo 信息源
信息源	类型	说明
Nature	学术期刊	顶级综合性科学期刊
Science	学术期刊	顶级综合性科学期刊
Cell	学术期刊	生命科学顶级期刊
NEJM	学术期刊	新英格兰医学杂志
The Lancet	学术期刊	柳叶刀医学杂志
生物谷	行业媒体	中文生物医药资讯
丁香园	行业媒体	中文医学资讯
医学界	行业媒体	中文医学资讯
药明康德	行业媒体	医药研发资讯
STAT News	国际媒体	英文医疗健康资讯
FierceBiotech	国际媒体	英文生物技术资讯
BioSpace	国际媒体	英文生物制药资讯
FDA News	监管机构	FDA 官方新闻
EMA News	监管机构	欧洲药品管理局新闻
NMPA	监管机构	中国药监局新闻
⚠️ 第七部分：常见问题和注意事项
7.1 数据源相关
Q1：如何判断 Feed ID 是否有效？
在 Folo 中打开该 Feed，查看是否有内容更新
在 Worker 日志中查看是否成功抓取到数据
Q2：抓取不到数据怎么办？
检查 Folo Cookie 是否过期（在 KV 中更新）
检查 Feed ID 是否正确
检查 FOLO_FILTER_DAYS 是否设置过小
Q3：数据源质量不好怎么办？
优先选择权威来源（顶级期刊、官方机构）
定期检查和更新 Feed 列表
根据实际效果调整 Feed 权重
7.2 提示词相关
Q4：提示词修改后效果不好怎么办？
先检查是否保留了"先想坑"的结构
对比修改前后的输出，找出问题所在
逐步调整，每次只改一个地方
可能需要 2-3 次迭代才能达到满意效果
Q5：如何让 AI 生成的内容更专业？
在提示词中增加专业术语的解释要求
提供更多领域相关的示例
调整"坑列表"，增加领域特有的错误
Q6：如何让 AI 生成的内容更通俗？
在提示词中强调"用人话解释"
增加类比和比喻的要求
在"坑列表"中增加"技术黑话堆砌"
7.3 部署相关
Q7：部署后访问 404 怎么办？
检查 Worker 是否部署成功（Cloudflare 控制台）
检查路由配置是否正确
检查域名绑定是否生效
Q8：Cron 任务没有触发怎么办？
检查 wrangler.toml 中的 [triggers] 配置
在 Cloudflare 控制台查看 Cron 触发日志
手动触发一次测试（访问 /scheduled 路由）
Q9：GitHub 提交失败怎么办？
检查 GitHub Token 是否有效
检查仓库权限是否正确
检查分支名称是否正确
7.4 成本相关
Q10：运行成本大概是多少？
Cloudflare Workers：免费额度通常够用（10 万次请求/天）
AI API 调用：取决于使用的模型和调用次数
Gemini：相对便宜，约 $0.001/次
OpenAI：中等，约 $0.01/次
Claude：较贵，约 $0.02/次
GitHub Pages：完全免费
总成本：每月约 $5-20（取决于流量和 AI 调用次数）
Q11：如何降低成本？
使用 Gemini（最便宜）
使用中转 API（比官方便宜）
减少 AI 调用次数（合并多个步骤）
使用缓存（避免重复生成）
7.5 内容质量相关
Q12：如何提高日报质量？
数据源质量：选择权威、高质量的信息源
提示词优化：根据实际效果不断调整
人工筛选：保留手动勾选环节，确保内容相关性
定期审查：每周检查一次输出质量，及时调整
Q13：如何避免内容重复？
项目已内置去重逻辑（基于 URL 和标题）
如果仍有重复，可以调整 FOLO_FILTER_DAYS
在提示词中强调"避免重复"
Q14：如何处理多语言内容？
如果数据源包含英文内容，可以开启翻译功能
在 wrangler.toml 中设置 OPEN_TRANSLATE = "true"
或者在提示词中要求 AI 翻译
🎓 第八部分：进阶优化建议
8.1 添加新的数据源类型
如果 Folo 无法满足需求，可以添加自定义数据源。 参考文档：项目拓展性指南 示例：添加 PubMed API
在 src/dataSources/ 创建 pubmed.js
实现 fetch() 和 transform() 方法
在 src/dataFetchers.js 中注册
8.2 优化 AI 生成效果
技巧 1：多步骤生成
第一步：生成初稿
第二步：优化语言
第三步：生成摘要
技巧 2：Few-shot Learning
在提示词中提供 3-5 个高质量示例
AI 会模仿示例的风格和结构
技巧 3：Chain-of-Thought
让 AI 先分析内容，再生成日报
提高输出的逻辑性和连贯性
8.3 自动化测试
建议：
每次修改提示词后，运行一次测试生成
对比修改前后的输出质量
记录每次修改的效果，建立优化日志
8.4 用户反馈收集
建议：
在日报底部添加反馈链接
定期收集读者意见
根据反馈调整内容方向和风格
📚 第九部分：参考资源
官方文档
Cloudflare Workers 文档
Wrangler CLI 文档
Cloudflare KV 文档
GitHub API 文档
AI 模型文档
Google Gemini API
OpenAI API
Anthropic Claude API
相关项目
Folo - 信息聚合平台
Hugo - 静态网站生成器
Hextra 主题 - Hugo 主题
mdBook - Rust 文档生成器
🎉 总结
通过本指南，你应该能够在 2-3 小时内将"AI 资讯日报"项目改造成任何垂直领域的日报站点。 关键步骤回顾：
✅ 修改 wrangler.toml 中的核心配置（10 项）
✅ 修改 5 个提示词文件（保留"先想坑"结构）
✅ 配置新领域的 Folo Feed IDs（15-30 个）
✅ 修改广告和页脚（可选）
✅ 测试、部署、验证
预期效果：
📰 每日自动生成高质量日报
🎙️ 支持播客脚本生成
📊 支持周报深度分析
🌐 自动发布到 GitHub Pages
📡 提供 RSS 订阅
如有问题：
查看项目 README
查看 部署指南
查看 拓展性指南
提交 Issue
祝你改造顺利！🚀


---
