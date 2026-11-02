import { canonicalUrl } from './opportunityRecords.js';

const URLS = /https?:\/\/[^\s)<>\]"']+/g;

export function createOpportunitySourceReferences(originalPrompt) {
    const byUrl = new Map();
    const byId = new Map();
    for (const raw of String(originalPrompt).match(URLS) || []) {
        const url = canonicalUrl(raw);
        if (!url?.startsWith('https://') || byUrl.has(url)) continue;
        const id = `BIOAI_SOURCE_${byUrl.size + 1}`;
        byUrl.set(url, id);
        byId.set(id, url);
    }
    return {
        instructions: '来源地址由程序映射为 BIOAI_SOURCE_数字。引用时逐字复制素材编号，例如 [素材来源](BIOAI_SOURCE_1)，程序会恢复真实链接；编号不进入可见正文。不自行重写、猜测或补造网址。失败草稿中的新网址不是新来源。',
        protect(text) {
            return String(text).replace(URLS, raw => byUrl.get(canonicalUrl(raw)) || raw);
        },
        restore(text) {
            return String(text).replace(/\bBIOAI_SOURCE_\d+\b/g, id => {
                if (!byId.has(id)) throw new Error('Unknown opportunity source reference');
                return `<${byId.get(id)}>`;
            });
        },
    };
}
