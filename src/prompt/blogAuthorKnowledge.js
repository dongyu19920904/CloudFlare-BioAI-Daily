import knowledge from './blogAuthorKnowledge.json' with { type: 'json' };

export const BLOG_AUTHOR_KNOWLEDGE_VERSION = knowledge.version;

export function selectBlogAuthorRecords(blogType, asOfDate = null, signals = []) {
    const text = signals.join('\n').toLowerCase();
    if (!text.trim()) return [];
    return knowledge.milestones
        .filter(item => (!asOfDate || item.date <= asOfDate) && item.topics.includes(blogType))
        .map(item => ({ item, score: item.keywords.filter(word => text.includes(word.toLowerCase())).length }))
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date))
        .slice(0, knowledge.editorialPolicy.maxRelatedRecords)
        .map(entry => entry.item);
}

export function getBlogAuthorKnowledge(asOfDate = null, blogType = 'ai-daily', signals = []) {
    const records = selectBlogAuthorRecords(blogType, asOfDate, signals);
    const material = records.map(item => `- ${item.date} [${item.status}] ${item.title}：${item.text}`).join('\n');
    return `
## 经复核的相关作者材料（资料核对至 ${knowledge.updatedAt}）

长期方向：用 AI 做具体事情，将时间留给生命延续学的探索。
下面记录按当前话题筛选，最多三项。它们不是文章必须使用的段落；无关就不写。
${material || '没有与这次触发材料直接匹配的个人记录。只写有依据的判断，不编体验。'}

计划、工程实验和交付报告不得改写为今天完成或亲历。作者经营数字、原始日记、客户消息和采购渠道不进入默认写作输入。
`;
}
