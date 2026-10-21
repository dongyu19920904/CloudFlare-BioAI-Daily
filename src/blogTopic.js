import { containsModelFailure, extractUrls } from './blogQuality.js';

export function selectBlogWritingMaterial(dailyContent, blogType) {
    const text = String(dailyContent || '');
    if (containsModelFailure(text)) return text;
    const blocks = text.split(/(?=^#{2,3}\s)/m).filter(block => /^#{2,3}\s/.test(block) && block.length >= 180 && extractUrls(block).length > 0);
    const scored = blocks.map((block, index) => {
        const title = block.split('\n')[0];
        let score = 0;
        if (blogType === 'ai-daily') {
            if (/Claude Code|Codex|Cursor|Graphify|编程助手|开源工具|代码库/i.test(title)) score += 8;
            if (/操作|教程|工具|代码|项目|怎么|如何|工作流|截图/.test(block)) score += 3;
            if (/MAU|月活|日活|融资|估值|市值|排行榜|获奖|奖项|营收|峰会/i.test(title)) score -= 12;
        } else {
            if (/brain2vec|脑龄|脑年龄|生物年龄|衰老时钟|aging clock|AI|人工智能|开源|wearable|可穿戴/i.test(title)) score += 8;
            if (/怎么|如何|测量|数据|工具|预测|检测|公开|扫描/.test(block)) score += 3;
            if (/award|finalist|summit|奖项|名单|融资/i.test(title)) score -= 12;
        }
        return { block, index, score };
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    return scored[0]?.score > 0 ? scored[0].block.trim() : text;
}
