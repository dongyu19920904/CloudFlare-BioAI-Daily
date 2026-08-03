const TRACKING_PARAM_PATTERN = /^(utm_|fbclid$|gclid$|ref$|ref_src$)/i;

const PRIMARY_SOURCE_DOMAINS = [
    'doi.org',
    'europepmc.org',
    'pubmed.ncbi.nlm.nih.gov',
    'clinicaltrials.gov',
    'who.int',
    'fda.gov',
    'nmpa.gov.cn',
    'nih.gov',
    'github.com',
];

const SECONDARY_SOURCE_DOMAINS = [
    'reuters.com',
    'apnews.com',
    'nature.com',
    'science.org',
    'statnews.com',
    'technologyreview.com',
];

function compactText(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeUrl(value) {
    if (!value) return '';
    try {
        const parsed = new URL(value);
        for (const key of [...parsed.searchParams.keys()]) {
            if (TRACKING_PARAM_PATTERN.test(key)) parsed.searchParams.delete(key);
        }
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return String(value).trim();
    }
}

function getHostname(value) {
    try {
        return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
}

function domainMatches(hostname, domains) {
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function extractDoi(...values) {
    const text = values.map(compactText).join(' ');
    const match = text.match(/\b10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
    return match ? match[0].replace(/[),.;]+$/g, '').toLowerCase() : '';
}

export function extractPmid(...values) {
    const text = values.map(compactText).join(' ');
    const explicit = text.match(/\bPMID\s*[:#]?\s*(\d{6,10})\b/i);
    if (explicit) return explicit[1];
    const urlMatch = text.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{6,10})/i);
    return urlMatch ? urlMatch[1] : '';
}

export function extractClinicalTrialId(...values) {
    const text = values.map(compactText).join(' ');
    const match = text.match(/\bNCT\d{8}\b/i);
    return match ? match[0].toUpperCase() : '';
}

export function extractGithubRepo(...values) {
    const text = values.map(compactText).join(' ');
    const match = text.match(/github\.com\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)/i);
    if (!match) return '';
    const repo = match[2].replace(/\.git$/i, '');
    if (!repo || ['issues', 'pull', 'releases'].includes(repo.toLowerCase())) return '';
    return `${match[1]}/${repo}`.toLowerCase();
}

function normalizeTitle(value) {
    return compactText(value)
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildEditorialDedupeKeys(item = {}) {
    const details = item.details || {};
    const values = [item.url, item.title, item.description, details.content_html, details.doi, details.pmid, details.nctId];
    const keys = [];
    const doi = extractDoi(...values);
    const pmid = String(details.pmid || extractPmid(...values)).replace(/^PMID\s*:?/i, '').trim();
    const trialId = String(details.nctId || extractClinicalTrialId(...values)).toUpperCase();
    const repo = extractGithubRepo(...values);
    const url = normalizeUrl(item.url).toLowerCase();
    const title = normalizeTitle(item.title);

    if (doi) keys.push(`doi:${doi}`);
    if (pmid) keys.push(`pmid:${pmid}`);
    if (trialId) keys.push(`trial:${trialId}`);
    if (repo) keys.push(`repo:${repo}`);
    if (url) keys.push(`url:${url}`);
    if (title.length >= 24) keys.push(`title:${title}`);
    return [...new Set(keys)];
}

export function classifySourceAuthority(item = {}) {
    const details = item.details || {};
    if (details.sourceAuthority) return details.sourceAuthority;
    const hostname = getHostname(details.primarySourceUrl || item.url);
    if (domainMatches(hostname, PRIMARY_SOURCE_DOMAINS) || /\.(gov|edu)$/i.test(hostname)) return '一手/官方';
    if (domainMatches(hostname, SECONDARY_SOURCE_DOMAINS)) return '可信二手来源';
    if (item.type === 'socialMedia') return '社交平台/待核实';
    if (item.type === 'news') return '二手来源/待回溯';
    return '来源待核实';
}

export function inferStudyMetadata(item = {}) {
    const details = item.details || {};
    const text = compactText([
        item.title,
        item.description,
        details.abstractText,
        details.content_html,
        ...(details.pubTypes || []),
    ].join(' '));
    const lower = text.toLowerCase();

    let studyType = details.studyType || '未报告';
    if (studyType === '未报告') {
        if (/systematic review|meta-analysis|meta analysis/i.test(text)) studyType = '系统综述/荟萃分析';
        else if (/randomi[sz]ed controlled|randomi[sz]ed trial|\brct\b/i.test(text)) studyType = '随机对照试验';
        else if (/clinical trial|phase\s*[1-4iIvV]+/i.test(text)) studyType = '临床试验';
        else if (/prospective cohort|retrospective cohort|cohort study|\bcohorts?\b/i.test(text)) studyType = '队列研究';
        else if (/cross-sectional|observational study/i.test(text)) studyType = '观察性研究';
        else if (/preprint|biorxiv|medrxiv|arxiv/i.test(text) || details.isPreprint) studyType = '预印本';
        else if (/mouse|mice|murine|rat\b|rats\b|drosophila|c\. elegans/i.test(text)) studyType = '动物研究';
        else if (/in vitro|cell line|cell culture|organoid/i.test(text)) studyType = '细胞/类器官研究';
        else if (item.type === 'project') studyType = '开源项目';
        else if (item.type === 'news') studyType = '新闻/机构发布';
    }

    let species = details.species || '未报告';
    if (species === '未报告') {
        const hasHumanParticipants = /participants|patients|people|adults|children|subjects|individuals|human (?:participants|patients|subjects|samples|cohort)/i.test(text);
        const hasMouse = /mouse|mice|murine/i.test(text);
        const hasRat = /\brat\b|\brats\b/i.test(text);
        const hasOtherAnimal = /drosophila|c\. elegans|caenorhabditis/i.test(text);
        const hasAnimal = hasMouse || hasRat || hasOtherAnimal;
        if (hasHumanParticipants && hasAnimal) species = '混合/未明确';
        else if (hasHumanParticipants) species = '人类';
        else if (hasMouse) species = '小鼠';
        else if (hasRat) species = '大鼠';
        else if (/drosophila/i.test(text)) species = '果蝇';
        else if (/c\. elegans|caenorhabditis/i.test(text)) species = '线虫';
        else if (/cell line|cell culture|in vitro/i.test(text)) species = '细胞模型';
        else if (item.type === 'project') species = '不适用';
    }

    let sampleSize = details.sampleSize || '未报告';
    if (sampleSize === '未报告') {
        const sampleMatch = text.match(/(?:n\s*=\s*|included\s+|enrolled\s+|among\s+)([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{1,6})(?:\s+(?:participants|patients|people|adults|subjects|samples|mice|rats))?/i);
        if (sampleMatch) sampleSize = `n=${sampleMatch[1].replace(/,/g, '')}`;
        else if (item.type === 'project') sampleSize = '不适用';
    }

    let peerReviewStatus = details.peerReviewStatus || '未确认';
    if (details.isPreprint || /preprint|biorxiv|medrxiv|arxiv/i.test(lower)) peerReviewStatus = '预印本/未同行评审';
    else if (details.journalTitle || details.journal || /journal|published in/i.test(lower)) peerReviewStatus = '已发表（同行评审状态以期刊记录为准）';

    return { studyType, species, sampleSize, peerReviewStatus };
}

function evidenceFor(item, metadata, authority) {
    const details = item.details || {};
    const text = compactText([item.title, item.description, details.abstractText, details.content_html].join(' '));
    const isPreliminary = metadata.studyType === '预印本'
        || metadata.studyType === '动物研究'
        || metadata.studyType === '细胞/类器官研究'
        || metadata.studyType === '新闻/机构发布'
        || metadata.studyType === '开源项目'
        || metadata.peerReviewStatus.includes('预印本')
        || authority.includes('待核实');

    if (isPreliminary) {
        const reason = metadata.studyType === '动物研究' || metadata.studyType === '细胞/类器官研究'
            ? `${metadata.studyType}，不能直接外推到人体`
            : `${metadata.studyType}，尚不足以支持临床效果判断`;
        return { level: '初步', reason };
    }

    const parsedSample = Number.parseInt(String(metadata.sampleSize).replace(/\D/g, ''), 10);
    if (metadata.studyType === '系统综述/荟萃分析' && authority === '一手/官方') {
        return { level: '高', reason: '一手发表的系统综述/荟萃分析，但仍需结合纳入研究质量解读' };
    }
    if (metadata.studyType === '随机对照试验' && authority === '一手/官方' && Number.isFinite(parsedSample) && parsedSample >= 200) {
        return { level: '高', reason: `一手随机对照研究，报告样本量 ${metadata.sampleSize}` };
    }
    if (['随机对照试验', '临床试验', '队列研究', '观察性研究'].includes(metadata.studyType)
        && metadata.species === '人类'
        && authority === '一手/官方') {
        return {
            level: '中',
            reason: `${metadata.studyType}的人体证据；${metadata.sampleSize === '未报告' ? '样本量未报告' : `样本量 ${metadata.sampleSize}`}，不能自动视为因果或临床获益`,
        };
    }
    if (/validated|external validation/i.test(text) && authority === '一手/官方') {
        return { level: '中', reason: '有验证信息的一手研究，但临床可用性仍需独立验证' };
    }
    return { level: '初步', reason: '研究设计、样本或同行评审信息不足，结论需要进一步核实' };
}

function inferApplicationDistance(item, metadata, evidence) {
    if (item.type === 'project') return '可尝试研究演示；不能直接用于医疗决策';
    if (metadata.studyType === '系统综述/荟萃分析' || metadata.studyType === '随机对照试验') {
        return evidence.level === '高' ? '接近实践评估，但仍需指南、监管与真实世界验证' : '仍需更大样本或独立重复';
    }
    if (metadata.species === '人类' && evidence.level !== '初步') return '有人体数据，距离常规应用仍需外部验证与监管评估';
    if (['动物研究', '细胞/类器官研究'].includes(metadata.studyType)) return '基础研究阶段，距离人体应用较远';
    return '尚不能判断；需要一手研究和独立验证';
}

function inferTopicKey(item) {
    const text = compactText(`${item.title || ''} ${item.description || ''}`).toLowerCase();
    const topics = [
        ['aging-clock', /aging clock|biological age|epigenetic clock|methylation age|brain age|生物年龄|衰老时钟/],
        ['dementia', /alzheimer|dementia|认知|阿尔茨海默|痴呆/],
        ['senescence', /senescen|senolytic|细胞衰老|衰老细胞/],
        ['drug-discovery', /drug discovery|therapeutic|protein design|药物|蛋白质设计/],
        ['multi-omics', /multi-omics|proteomic|metabolomic|transcriptomic|single-cell|多组学|单细胞/],
        ['wearables', /wearable|digital biomarker|可穿戴|数字生物标志物/],
    ];
    return topics.find(([, pattern]) => pattern.test(text))?.[0] || normalizeTitle(item.title).split(' ').slice(0, 5).join('-') || 'other';
}

function qualityScore(item, editorial) {
    const evidenceScore = { '高': 40, '中': 28, '初步': 12 }[editorial.evidenceLevel] || 0;
    const authorityScore = { '一手/官方': 24, '可信二手来源': 14, '二手来源/待回溯': 6 }[editorial.sourceAuthority] || 2;
    const typeScore = item.type === 'paper' ? 16 : item.type === 'project' ? 10 : item.type === 'news' ? 8 : 2;
    const dateScore = Number.isFinite(new Date(item.published_date).getTime()) ? 8 : 0;
    return evidenceScore + authorityScore + typeScore + dateScore;
}

export function normalizeEditorialItem(item = {}, sourceType = item.type || 'unknown') {
    const normalizedItem = {
        ...item,
        type: item.type || sourceType,
        details: { ...(item.details || {}) },
    };
    const authority = classifySourceAuthority(normalizedItem);
    const metadata = inferStudyMetadata(normalizedItem);
    const evidence = evidenceFor(normalizedItem, metadata, authority);
    const details = normalizedItem.details;
    const doi = String(details.doi || extractDoi(item.url, item.title, item.description, details.content_html)).toLowerCase();
    const pmid = String(details.pmid || extractPmid(item.url, details.content_html));
    const nctId = String(details.nctId || extractClinicalTrialId(item.url, item.title, details.content_html)).toUpperCase();
    const githubRepo = extractGithubRepo(item.url, item.title, item.description);
    const canonicalId = doi ? `doi:${doi}` : pmid ? `pmid:${pmid}` : nctId ? `trial:${nctId}` : githubRepo ? `repo:${githubRepo}` : `url:${normalizeUrl(item.url)}`;
    const primarySourceUrl = normalizeUrl(details.primarySourceUrl || item.url);
    const editorial = {
        canonicalId,
        entityType: normalizedItem.type,
        title: compactText(item.title),
        source: compactText(item.source || getHostname(primarySourceUrl) || '未报告'),
        primarySourceUrl,
        sourceAuthority: authority,
        doi: doi || '',
        pmid: pmid || '',
        clinicalTrialId: nctId || '',
        githubRepo: githubRepo || '',
        studyType: metadata.studyType,
        species: metadata.species,
        sampleSize: metadata.sampleSize,
        peerReviewStatus: metadata.peerReviewStatus,
        evidenceLevel: evidence.level,
        evidenceReason: evidence.reason,
        applicationDistance: inferApplicationDistance(normalizedItem, metadata, evidence),
        topicKey: inferTopicKey(normalizedItem),
    };
    editorial.qualityScore = qualityScore(normalizedItem, editorial);
    normalizedItem.details.editorial = editorial;
    return normalizedItem;
}

export function formatDailyPromptItem(item = {}) {
    const editorial = item.details?.editorial || normalizeEditorialItem(item).details.editorial;
    const content = compactText(item.details?.abstractText || item.details?.content_html || item.description).slice(0, 1200);
    return [
        `素材 ID: ${editorial.canonicalId}`,
        `类型: ${editorial.entityType}`,
        `标题: ${editorial.title || '未报告'}`,
        `发布日期: ${item.published_date || '未报告'}`,
        `一手来源 URL: ${editorial.primarySourceUrl || '未报告'}`,
        `来源名称: ${editorial.source}`,
        `来源级别: ${editorial.sourceAuthority}`,
        `研究类型: ${editorial.studyType}`,
        `物种/对象: ${editorial.species}`,
        `样本量: ${editorial.sampleSize}`,
        `同行评审: ${editorial.peerReviewStatus}`,
        `证据等级: ${editorial.evidenceLevel}`,
        `证据依据: ${editorial.evidenceReason}`,
        `距离实际应用: ${editorial.applicationDistance}`,
        `素材摘要: ${content || '未提供'}`,
    ].join('\n');
}

export function buildEvidenceOverview(items = []) {
    const counts = { '高': 0, '中': 0, '初步': 0 };
    for (const item of items) {
        const level = item.details?.editorial?.evidenceLevel;
        if (Object.hasOwn(counts, level)) counts[level] += 1;
    }
    return `高 ${counts['高']} 条 / 中 ${counts['中']} 条 / 初步 ${counts['初步']} 条。证据等级表示当前研究可信度，不代表治疗建议或可直接应用。`;
}

const REQUIRED_SIGNAL_LABELS = [
    '发生了什么',
    '这意味着什么',
    '目前不能得出什么结论',
    '证据等级',
    '研究类型',
    '物种/对象',
    '样本量',
    '距离实际应用',
    '来源',
];

export function validateDailyMarkdown(markdown = '') {
    const text = String(markdown || '').trim();
    const errors = [];
    if (!/^##\s+今日重要信号\s*$/m.test(text)) errors.push('缺少“## 今日重要信号”标题');
    const headingMatches = [...text.matchAll(/^###\s+(\d+)\.\s+\[[^\]]+\]\((https?:\/\/[^)]+)\)\s*$/gm)];
    if (headingMatches.length < 3 || headingMatches.length > 8) errors.push(`重要信号数量必须为 3-8 条，当前为 ${headingMatches.length} 条`);

    const sections = text.split(/^###\s+\d+\.\s+/m).slice(1);
    sections.forEach((section, index) => {
        for (const label of REQUIRED_SIGNAL_LABELS) {
            if (!new RegExp(`\\*\\*${label.replace('/', '\\/')}\\*\\*`).test(section)) {
                errors.push(`第 ${index + 1} 条缺少“${label}”`);
            }
        }
        if (!/\*\*证据等级\*\*\s*[：:]\s*(高|中|初步)[（(].+[）)]/.test(section)) {
            errors.push(`第 ${index + 1} 条证据等级必须包含等级和依据`);
        }
        if (!/\*\*来源\*\*\s*[：:]\s*\[[^\]]+\]\(https?:\/\//.test(section)) {
            errors.push(`第 ${index + 1} 条必须提供可点击的一手或官方来源`);
        }
    });

    const forbiddenPatterns = [
        [/aivora\.cn/i, '普通日报不得硬塞爱窝啦商品链接'],
        [/逆龄神器|长生不老|延寿神器|生物黑客狂喜|下一个风口|震惊！|治愈衰老/i, '包含夸大或营销化措辞'],
        [/\bTOP\s*10\b|重磅\s*TOP/i, '不得使用 TOP 榜单结构'],
        [/##\s+.*趋势预测|##\s+.*相关问题|##\s+.*FAQ/i, '不得批量生成趋势预测或 FAQ'],
        [/动物(?:实验|研究).{0,40}(?:证明|证实).{0,30}(?:人体|患者).{0,30}(?:有效|疗效)/i, '动物研究被夸大为人体疗效'],
        [/(?:相关性|观察性研究).{0,40}(?:证明|证实).{0,30}(?:因果|治疗有效)/i, '相关性研究被夸大为因果或疗效'],
    ];
    for (const [pattern, message] of forbiddenPatterns) {
        if (pattern.test(text)) errors.push(message);
    }

    return { valid: errors.length === 0, errors: [...new Set(errors)], signalCount: headingMatches.length };
}
