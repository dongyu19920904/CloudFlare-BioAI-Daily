BioAI Daily - 实施指南
将 AI 日报项目改造为"AI 生命科学日报"

项目命名
项目	名称
后端 GitHub 仓库	CloudFlare-BioAI-Daily
前端 GitHub 仓库	BioAI-Daily-Web
Worker 名称	bioai-daily
本地后端文件夹	重命名为 CloudFlare-BioAI-Daily
本地前端文件夹	重命名为 BioAI-Daily-Web
Step 1: 重命名本地文件夹
# 重命名后端（在资源管理器中或用命令）
Rename-Item "D:\GitHub\CloudFlare-AI-LifeScience-Daily" "CloudFlare-BioAI-Daily"
# 重命名前端
Rename-Item "D:\GitHub\Hextra-AI-LifeScience-Daily" "BioAI-Daily-Web"
Step 2: 修改 
wrangler.toml
配置项	新值
name	bioai-daily
kv_namespaces[].id	新建KV后填入
GITHUB_REPO_NAME	BioAI-Daily-Web
DAILY_TITLE	AI 生命科学日报
DAILY_TITLE_MIN	`AI 生命科学日报`
PODCAST_TITLE	BioAI 播报
FOLO_NEWS_IDS	你的生命科学ID
Step 3: 修改 
.github/workflows/sync-blog-to-frontend.yml
第31行改为：

repository: dongyu19920904/BioAI-Daily-Web
Step 4: Cloudflare
创建 KV：名称 bioai-daily-kv，复制 ID 填入 
wrangler.toml
部署：npx wrangler deploy
配置 Secrets（API Keys）
Step 5: GitHub
创建空仓库：CloudFlare-BioAI-Daily + BioAI-Daily-Web
推送代码
配置 FRONTEND_SYNC_TOKEN