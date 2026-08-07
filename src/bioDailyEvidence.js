const TRACKING_QUERY_PATTERN = /^(?:utm_.+|fbclid|gclid|ref|ref_src)$/i;
const DOI_PATTERN = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i;
const TRIAL_PATTERN = /\bNCT\d{8}\b/i;
const ARXIV_PATTERN = /(?:arxiv(?:\.org\/(?:abs|pdf)\/|:)|papers\.cool\/arxiv\/)(\d{4}\.\d{4,5})(?:v\d+)?/i;
const GITHUB_PATTERN = /github\.com\/([^/?#\s]+)\/([^/?#\s]+)/i;

const PRIMARY_HOSTS = new Set([
    'arxiv.org',
    'biorxiv.org',
    'medrxiv.org',
    'doi.org',
    'pubmed.ncbi.nlm.nih.gov',
    'europepmc.org',
    'clinicaltrials.gov',
    'who.int',
    'fda.gov',
    'nmpa.gov.cn',
    'github.com',
]);

const DISCOVERY_HOSTS = new Set([
    'papers.cool',
    'news-medical.net',
    'longevity.technology',
    'google.com',
    'news.google.com',
]);

function getCandidateText(candidate) {
    return [
        candidate?.title,
        candidate?.description,
        candidate?.contentText,
        candidate?.text,
        candidate?.url,
        candidate?.details?.content_html,
        candidate?.details?.primaryEvidence?.title,
        candidate?.details?.primaryEvidence?.contentText,
    ].filter(Boolean).join(' ');
}

function normalizeHostname(hostname) {
    return String(hostname || '').toLowerCase().replace(/^www\./, '');
}

function isPrimaryHostname(hostname) {
    const normalized = normalizeHostname(hostname);
    return PRIMARY_HOSTS.has(normalized) || normalized.endsWith('.gov') || normalized.endsWith('.edu');
}

export function extractDoi(value) {
    const match = String(value || '').match(DOI_PATTERN);
    return match ? match[0].replace(/[),.;]+$/, '').toLowerCase() : '';
}

export function extractTrialId(value) {
    const match = String(value || '').match(TRIAL_PATTERN);
    return match ? match[0].toUpperCase() : '';
}

export function extractArxivId(value) {
    const match = String(value || '').match(ARXIV_PATTERN);
    return match ? match[1] : '';
}

export function extractGithubRepo(value) {
    const match = String(value || '').match(GITHUB_PATTERN);
    if (!match) return '';
    const owner = match[1].toLowerCase();
    const repo = match[2].replace(/\.git$/i, '').toLowerCase();
    return owner && repo ? `${owner}/${repo}` : '';
}

export function normalizeCanonicalUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const arxivId = extractArxivId(raw);
    if (arxivId) return `https://arxiv.org/abs/${arxivId}`;

    const trialId = extractTrialId(raw);
    if (trialId && /clinicaltrials\.gov/i.test(raw)) {
        return `https://clinicaltrials.gov/study/${trialId}`;
    }

    const doi = extractDoi(raw);
    if (doi && /(?:doi\.org|dx\.doi\.org)/i.test(raw)) {
        return `https://doi.org/${doi}`;
    }

    const repo = extractGithubRepo(raw);
    if (repo) return `https://github.com/${repo}`;

    try {
        const parsed = new URL(raw);
        parsed.hostname = normalizeHostname(parsed.hostname);
        parsed.hash = '';
        for (const key of [...parsed.searchParams.keys()]) {
            if (TRACKING_QUERY_PATTERN.test(key)) parsed.searchParams.delete(key);
        }
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return raw.replace(/\/$/, '');
    }
}

export function normalizeEventEntity(title) {
    return String(title || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\b(?:study|research|report|news|paper|new|latest|研究|报告|论文|最新|发现|发布)\b/gi, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
}

export function buildDailyCandidateIdentity(candidate) {
    const text = getCandidateText(candidate);
    const canonicalUrl = normalizeCanonicalUrl(candidate?.url);
    return {
        canonicalUrl,
        doi: extractDoi(text),
        trialId: extractTrialId(text),
        arxivId: extractArxivId(text),
        repo: extractGithubRepo(text),
        entity: normalizeEventEntity(candidate?.title),
    };
}

export function resolveDailyPrimarySource(candidate) {
    const explicitPrimary = normalizeCanonicalUrl(candidate?.primaryUrl);
    if (explicitPrimary) return explicitPrimary;

    const identity = buildDailyCandidateIdentity(candidate);
    if (identity.doi) return `https://doi.org/${identity.doi}`;
    if (identity.trialId) return `https://clinicaltrials.gov/study/${identity.trialId}`;
    if (identity.repo) return `https://github.com/${identity.repo}`;
    if (identity.arxivId) return `https://arxiv.org/abs/${identity.arxivId}`;

    try {
        const canonicalUrl = normalizeCanonicalUrl(candidate?.url);
        return isPrimaryHostname(new URL(canonicalUrl).hostname) ? canonicalUrl : '';
    } catch {
        return '';
    }
}

export function hasDailyPrimarySource(candidate) {
    return Boolean(resolveDailyPrimarySource(candidate));
}

export function getDailyCandidateDedupeKeys(candidate) {
    const identity = buildDailyCandidateIdentity(candidate);
    return [
        identity.canonicalUrl && `url:${identity.canonicalUrl.toLowerCase()}`,
        identity.doi && `doi:${identity.doi}`,
        identity.trialId && `trial:${identity.trialId}`,
        identity.arxivId && `arxiv:${identity.arxivId}`,
        identity.repo && `repo:${identity.repo}`,
        identity.entity && identity.entity.length >= 18 && `entity:${identity.entity}`,
    ].filter(Boolean);
}

export function classifySourceTier(candidate) {
    const explicitPrimary = normalizeCanonicalUrl(candidate?.primaryUrl);
    if (explicitPrimary) {
        try {
            if (isPrimaryHostname(new URL(explicitPrimary).hostname)) {
                return { tier: 'A', reason: '已绑定论文、注册平台、公共机构或项目官方入口' };
            }
        } catch {
            // Fall through to the discovery URL classification.
        }
    }
    const canonicalUrl = normalizeCanonicalUrl(candidate?.url);
    let hostname = '';
    try {
        hostname = normalizeHostname(new URL(canonicalUrl).hostname);
    } catch {
        return { tier: 'D', reason: '链接无法解析，只能作为发现线索' };
    }

    if (PRIMARY_HOSTS.has(hostname) || hostname.endsWith('.gov') || hostname.endsWith('.edu')) {
        return { tier: 'A', reason: '论文、注册平台、公共机构或项目官方入口' };
    }
    if (DISCOVERY_HOSTS.has(hostname)) {
        return { tier: 'C', reason: '聚合或专业媒体，需要回到一手来源核实' };
    }
    if (/\b(?:press|investor|company|official)\b/i.test(getCandidateText(candidate))) {
        return { tier: 'B', reason: '机构或公司直接披露，需标注利益关系' };
    }
    return { tier: 'C', reason: '二手来源，关键医学事实需交叉核验' };
}

function detectStudyType(text) {
    if (/systematic review|meta-analysis|系统综述|荟萃分析/i.test(text)) return '系统综述/荟萃分析';
    if (/randomi[sz]ed(?: controlled)? trial|randomly assigned|double[- ]blind|placebo[- ]controlled|随机对照|随机分组|双盲|安慰剂对照/i.test(text)) return '人体随机对照试验';
    if (/clinical trial|phase\s*[1-4]|临床试验|\bNCT\d{8}\b/i.test(text)) return '人体临床试验';
    if (/cohort|prospective|retrospective|longitudinal|队列|前瞻性|回顾性|纵向/i.test(text)) return '人体观察性/队列研究';
    if (/\b(?:mouse|mice|murine|rat|rats|animal|animals)\b|小鼠|大鼠|动物实验/i.test(text)) return '动物研究';
    if (/in vitro|cell line|organoid|体外|细胞系|类器官/i.test(text)) return '体外研究';
    if (/benchmark|dataset|模型评测|基准测试/i.test(text)) return 'AI/工具基准测试';
    if (/github\.com|open source|开源/i.test(text)) return '开源项目/研究工具';
    return '素材未明确说明';
}

function detectPopulation(text, studyType) {
    const sampleMatch = text.match(/(?:\bN\s*=\s*|\bn\s*=\s*|\b)(\d{2,6})\s*(?:participants?|patients?|subjects?|people|adults?|samples?|mice|rats|名|例|人|只小鼠|只大鼠)/i);
    const sample = sampleMatch ? sampleMatch[0].replace(/\s+/g, ' ').trim() : '样本量未在素材中明确报告';
    let species = '对象未在素材中明确报告';
    if (/^动物研究/.test(studyType)) {
        if (/\b(?:mouse|mice|murine)\b|小鼠/i.test(text)) species = '小鼠';
        else if (/\b(?:rat|rats)\b|大鼠/i.test(text)) species = '大鼠';
        else if (/\b(?:dog|dogs|canine)\b|犬|狗/i.test(text)) species = '犬';
        else species = '动物模型（物种需回看原文）';
    } else if (/^人体/.test(studyType) || /\b(?:human|participants?|patients?|people|adults?|subjects?)\b|人体|患者|参与者/i.test(text)) species = '人类/人体样本';
    else if (/\b(?:mouse|mice|murine)\b|小鼠/i.test(text)) species = '小鼠';
    else if (/\b(?:rat|rats)\b|大鼠/i.test(text)) species = '大鼠';
    else if (/\b(?:dog|dogs|canine)\b|犬|狗/i.test(text)) species = '犬';
    else if (/in vitro|cell line|organoid|体外|细胞系|类器官/i.test(text)) species = '体外模型';
    return `${species}；${sample}`;
}

export function inferDailyEvidence(candidate) {
    const text = getCandidateText(candidate);
    const sourceType = candidate?.sourceType || candidate?.type;
    const sourceTier = classifySourceTier(candidate);
    const publicationHint = [candidate?.details?.publicationStatus, candidate?.details?.sourceDatabase].filter(Boolean).join(' ');
    const isPreprint = Boolean(
        extractArxivId(text)
        || /preprint|biorxiv|medrxiv|research square|预印本|\bPPR\b/i.test(`${text} ${publicationHint}`)
        || /doi\.org\/10\.21203\//i.test(candidate?.url || '')
    );
    let studyType = sourceType === 'project'
        ? '开源项目/研究工具'
        : detectStudyType(text);
    let evidenceText = text;
    if (sourceType === 'news') {
        const primaryEvidenceText = String(candidate?.details?.primaryEvidence?.contentText || '');
        evidenceText = primaryEvidenceText || String(candidate?.title || '');
        studyType = detectStudyType(evidenceText);
        if (studyType === '素材未明确说明') studyType = '新闻/机构动态（研究类型需回看一手来源）';
    }
    const population = detectPopulation(evidenceText, studyType);
    const animalOrPreclinical = /动物研究|体外研究|基准测试|素材未明确/.test(studyType)
        || /^(?:小鼠|大鼠|犬|体外模型)/.test(population);
    const evidenceLevel = sourceType === 'news' || isPreprint || animalOrPreclinical
        ? '初步'
        : /系统综述|随机对照/.test(studyType)
          ? '中'
          : '初步';

    return {
        sourceTier: sourceTier.tier,
        sourceReason: sourceTier.reason,
        studyType,
        population,
        publicationStatus: isPreprint
            ? '预印本/未完成同行评议'
            : /journal record|published/i.test(publicationHint)
              ? '期刊记录（同行评议状态以期刊页面为准）'
              : '请根据来源确认是否同行评议',
        evidenceLevel,
    };
}

function primaryIdentityKeys(candidate) {
    const identity = buildDailyCandidateIdentity(candidate);
    return [
        identity.doi && `doi:${identity.doi}`,
        identity.arxivId && `arxiv:${identity.arxivId}`,
        identity.trialId && `trial:${identity.trialId}`,
    ].filter(Boolean);
}

/**
 * Prefer a matching first-hand paper record before editorial selection. A
 * secondary item with the same DOI/arXiv/trial identity is removed, while its
 * discovery URL and media candidates remain attached to the primary record.
 */
export function enrichDailyCandidatesWithPrimaryEvidence(candidates = []) {
    const primaryByIdentity = new Map();
    const discoveryByIdentity = new Map();
    for (const candidate of candidates) {
        for (const key of primaryIdentityKeys(candidate)) {
            if (candidate?.sourceType === 'paper') {
                if (!primaryByIdentity.has(key)) primaryByIdentity.set(key, candidate);
            } else {
                const discoveries = discoveryByIdentity.get(key) || [];
                discoveries.push(candidate);
                discoveryByIdentity.set(key, discoveries);
            }
        }
    }

    return candidates.flatMap((candidate) => {
        const identityKeys = primaryIdentityKeys(candidate);
        if (candidate?.sourceType !== 'paper') {
            return identityKeys.some((key) => primaryByIdentity.has(key)) ? [] : [candidate];
        }

        const relatedDiscoveries = identityKeys
            .flatMap((key) => discoveryByIdentity.get(key) || [])
            .filter((item, index, items) => items.indexOf(item) === index);
        if (relatedDiscoveries.length === 0) return [candidate];

        const discoveryUrl = relatedDiscoveries
            .map((item) => normalizeCanonicalUrl(item?.details?.discoveryUrl || item?.url))
            .find(Boolean);
        return [{
            ...candidate,
            mediaCandidates: [...new Set([
                ...(candidate.mediaCandidates || []),
                ...relatedDiscoveries.flatMap((item) => item.mediaCandidates || []),
            ])],
            details: {
                ...(candidate.details || {}),
                discoveryUrl: candidate?.details?.discoveryUrl || discoveryUrl || '',
            },
        }];
    });
}

export function buildDailyEvidencePromptHint(candidate) {
    const evidence = inferDailyEvidence(candidate);
    const identity = buildDailyCandidateIdentity(candidate);
    const primaryUrl = resolveDailyPrimarySource(candidate);
    const discoveryUrl = normalizeCanonicalUrl(candidate?.details?.discoveryUrl || (primaryUrl !== identity.canonicalUrl ? identity.canonicalUrl : ''));
    return [
        `Canonical source: ${identity.canonicalUrl || candidate?.url || 'N/A'}`,
        `Primary source: ${primaryUrl || 'not verified — do not use as a main biomedical claim'}`,
        discoveryUrl ? `Discovery source: ${discoveryUrl}` : '',
        `Source tier: ${evidence.sourceTier} (${evidence.sourceReason})`,
        `Detected study type: ${evidence.studyType}`,
        `Detected subject/sample: ${evidence.population}`,
        `Publication status hint: ${evidence.publicationStatus}`,
        `Evidence ceiling: ${evidence.evidenceLevel}`,
        identity.doi ? `DOI: ${identity.doi}` : '',
        identity.trialId ? `Trial ID: ${identity.trialId}` : '',
        identity.repo ? `Canonical GitHub repo: ${identity.repo}` : '',
    ].filter(Boolean).join('\n');
}

export function buildAllowedSourceUrls(candidates = []) {
    const urls = new Set();
    for (const candidate of candidates) {
        const identity = buildDailyCandidateIdentity(candidate);
        for (const value of [candidate?.url, candidate?.primaryUrl, candidate?.details?.discoveryUrl, identity.canonicalUrl, resolveDailyPrimarySource(candidate)]) {
            const normalized = normalizeCanonicalUrl(value);
            if (normalized) urls.add(normalized);
        }
        if (identity.doi) urls.add(`https://doi.org/${identity.doi}`);
        if (identity.trialId) urls.add(`https://clinicaltrials.gov/study/${identity.trialId}`);
        if (identity.repo) urls.add(`https://github.com/${identity.repo}`);
        if (identity.arxivId) urls.add(`https://arxiv.org/abs/${identity.arxivId}`);
    }
    return urls;
}
