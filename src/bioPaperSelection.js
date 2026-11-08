// Editorial relevance, not scientific validity or evidence of a health benefit.
const AI = /\b(ai|artificial intelligence|machine learning|deep learning|neural network\w*|transformer\w*|foundation model\w*|llms?|large language model\w*|diffusion|self-supervised|multi-?agent|agents?|agentic|vision-language|sequence-based model\w*|state[- ]space model\w*|convolution\w*|representation learning)\b|人工智能|机器学习|深度学习|大模型|智能体/i;
const DIRECT_BIO = /\b(protein\w*|peptide\w*|enzym\w*|drug discovery|drug design|ligand\w*|genom\w*|genetic (?:variant\w*|mutation\w*|disorder\w*)|gene (?:expression|regulat\w*|edit\w*|sequenc\w*)|transcriptom\w*|proteom\w*|metabolom\w*|single[- ]cell|epigenetic\w*|methylation|biomarker\w*)\b|蛋白|酶|基因|组学|单细胞|药物发现|生物标志物/i;
const BIO = /\b(biomedic\w*|biochemical\w*|bioinformat\w*|drug\w*|clinical|patient\w*|tumou?r\w*|cancer\w*|mri|eeg|ecg|electrocardio\w*|neuroimag\w*|alzheimer\w*|dementia|parkinson\w*|senescen\w*|senolytic\w*|geroscience|healthspan|lifespan|longevity|biological (?:age|ag(?:e)?ing)|brain age|cell segmentation|tissue\w*|physiolog\w*|patholog\w*)\b|药物|衰老|延寿|阿尔茨海默|临床|医学影像/i;
const LONGEVITY = /\b(biological (?:age|ag(?:e)?ing)|brain age|epigenetic clock|methylation clock|ag(?:e)?ing clock|senescen\w*|senolytic\w*|geroscience|healthspan|lifespan|longevity|alzheimer\w*|dementia)\b|生物年龄|衰老|延寿|阿尔茨海默/i;

function paperText(item) {
    const abstract = item?.description || item?.summary || item?.text || item?.contentHtml || item?.details?.content_html || '';
    return `${item?.title || ''}\n${abstract}`.slice(0, 12000)
        .replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ')
        .split(/[.!?;\n]+/)
        .filter(sentence => !/\b(future (?:applications?|work)|may (?:eventually |also )?(?:include|benefit|enable)|could (?:eventually )?be applied)\b/i.test(sentence))
        .join('\n');
}

export function assessBioPaper(item) {
    const text = paperText(item);
    const cropOnly = /\b(crops?|farming|agricultur\w*|plantvillage|potato|leaf disease)\b/i.test(text)
        && !/\b(human|patient\w*|clinical|mice|mouse|mammal\w*|drug discovery)\b/i.test(text);
    if (cropOnly || !(DIRECT_BIO.test(text) || BIO.test(text))) return { priority: 0, reason: cropOnly ? 'agriculture_only' : 'no_biological_object' };
    if (!AI.test(text)) return { priority: 1, reason: 'biological_background' };
    return LONGEVITY.test(text)
        ? { priority: 3, reason: 'ai_longevity' }
        : { priority: 2, reason: 'ai_biological_method' };
}

export function getArxivIdentity(item) {
    for (const value of [item?.url, item?.id]) {
        try {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol)) continue;
            const path = url.pathname.replace(/\/$/, '');
            const match = ['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'].includes(url.hostname.toLowerCase())
                ? path.match(/^\/(?:abs|pdf)\/(.+)$/i)
                : url.hostname.toLowerCase() === 'papers.cool' ? path.match(/^\/arxiv\/(.+)$/i) : null;
            if (!match) continue;
            const id = match[1].replace(/\.pdf$/i, '').replace(/v\d+$/i, '').toLowerCase();
            if (/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z-]+)?\/\d{7})$/.test(id)) return id;
        } catch { /* Non-URL IDs are not evidence of an arXiv identity. */ }
    }
    return '';
}

function itemTime(item) {
    return Date.parse(item?.published_date || item?.publishedDate || item?.date_published || '') || 0;
}

function hasMedia(item) {
    return Boolean(item?.hasMedia || item?.imageUrl || item?.details?.imageUrl || /<(?:img|video)\b/i.test(item?.details?.content_html || ''));
}

export function selectBioPapers(items = [], { relevantOnly = false } = {}) {
    const seen = new Set();
    return items.map(item => ({ item, priority: assessBioPaper(item).priority, direct: Number(DIRECT_BIO.test(paperText(item))) }))
        .filter(({ priority }) => !relevantOnly || priority > 0)
        .sort((a, b) => b.priority - a.priority || b.direct - a.direct || itemTime(b.item) - itemTime(a.item) || Number(hasMedia(b.item)) - Number(hasMedia(a.item)))
        .filter(({ item }) => {
            const key = getArxivIdentity(item) || item.url || item.id;
            if (!key) return true;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).map(({ item }) => item);
}

export function summarizePaperSources(items = []) {
    const counts = {};
    for (const item of items) {
        const key = String(item.source || 'unknown').replace(/[\r\n\t]/g, ' ').slice(0, 100);
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}
