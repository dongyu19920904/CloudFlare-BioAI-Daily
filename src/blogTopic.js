import { containsModelFailure, extractUrls, qualifyDailyForPersonalBlog } from './blogQuality.js';
import { blogAngle, canonicalBlogSource } from './blogHistory.js';

export function getBlogReaderBrief(material, blogType) {
    if (blogType === 'bioai-daily' && /脑年龄|脑龄|brain.?age/i.test(material)) {
        return '本篇唯一问题：AI 估出的脑年龄，能告诉一个人身体老了多少吗？用明确标为假设的年龄例子解释估计值与个人健康结论的区别，再用这项研究的一两件事实说明。年龄预测与疾病分类是不同任务，不相互推导。研究的训练改进最多一句，不展开训练起点、冻结嵌入、疾病分类或模型架构。不从训练方法影响误差推导指标不客观、离临床很远，不写来源没给的改进幅度或临床验证状态。不教读者上传脑片。';
    }
    return blogType === 'bioai-daily'
        ? '本篇唯一问题：这项研究让一个普通人多明白了什么，它目前支持到哪一步？只留回答这件事必要的事实，不从头讲论文，不给医疗干预建议。'
        : '从本次来源实际提供的功能、变化或限制里，选择一个具体的读者问题。问题必须随材料变化，不能因为出现 Codex、Claude Code 或 Cursor 就写成检查调用关系；收购公告也不证明新增代码分析功能。说清一次真实用途或区别，不覆盖全部功能，不套用近期文章的开头和做法。';
}

export function selectBlogWritingMaterial(dailyContent, blogType, recentPosts = []) {
    const text = String(dailyContent || '');
    if (containsModelFailure(text)) return text;
    const blocks = text.split(/(?=^#{2,3}\s)/m).filter(block => /^#{2,3}\s/.test(block) && block.length >= 180 && extractUrls(block).length > 0);
    const used = new Set(recentPosts.flatMap(post => post.sources || []).map(canonicalBlogSource));
    const scored = blocks.filter(block => qualifyDailyForPersonalBlog(block, blogType).eligible && !extractUrls(block).some(url => used.has(canonicalBlogSource(url)))).map((block, index) => {
        const title = block.split('\n')[0];
        let score = 0;
        if (blogType === 'ai-daily') {
            if (/Claude Code|Codex|Cursor|Graphify|编程助手|开源工具|代码库/i.test(title)) score += 4;
            if (/AI|模型|工具|自动化|笔记|资料|搜索|图片|视频|语音|工作流/i.test(title)) score += 3;
            if (/操作|教程|工具|代码|项目|怎么|如何|工作流|截图/.test(block)) score += 3;
            if (/MAU|月活|日活|融资|估值|市值|排行榜|获奖|奖项|营收|峰会/i.test(title)) score -= 12;
        } else {
            if (/brain2vec|脑龄|脑年龄|生物年龄|衰老时钟|aging clock|AI|人工智能|开源|wearable|可穿戴/i.test(title)) score += 8;
            if (/怎么|如何|测量|数据|工具|预测|检测|公开|扫描/.test(block)) score += 3;
            if (/award|finalist|summit|奖项|名单|融资/i.test(title)) score -= 12;
        }
        if (blogAngle(block) && recentPosts.some(post => blogAngle(`${post.title}\n${post.body}`) === blogAngle(block))) score -= 20;
        return { block, index, score };
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    if (blocks.length && !scored.length) return '';
    return scored[0]?.score > 0 ? scored[0].block.trim() : recentPosts.length && blocks.length ? '' : text;
}
