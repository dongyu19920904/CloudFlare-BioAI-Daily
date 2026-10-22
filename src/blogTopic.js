import { containsModelFailure, extractUrls } from './blogQuality.js';

export function getBlogReaderBrief(material, blogType) {
    if (blogType === 'bioai-daily' && /脑年龄|脑龄|brain.?age/i.test(material)) {
        return '本篇唯一问题：AI 估出的脑年龄，能告诉一个人身体老了多少吗？用明确标为假设的年龄例子解释估计值与个人健康结论的区别，再用这项研究的一两件事实说明。年龄预测与疾病分类是不同任务，不相互推导。研究的训练改进最多一句，不展开训练起点、冻结嵌入、疾病分类或模型架构。不从训练方法影响误差推导指标不客观、离临床很远，不写来源没给的改进幅度或临床验证状态。不教读者上传脑片。';
    }
    if (blogType === 'ai-daily' && /代码库|编程助手|Claude Code|Codex|Cursor/i.test(material)) {
        return '本篇唯一问题：让 AI 改一个功能之前，怎样弄清还会影响哪些地方？用这个项目的一两个具体行为回答，给一个能核对结果的小办法。不要写向量检索与图遍历课程，不讲记忆测试分数，不将其他编程工具都概括成只搜关键词，不承诺关系图让答案更可靠。提取标签说明关系的来路，不表示提取器不会出错，两种标签都可回到文件核对。作者可以表达当前取舍，不补过去的使用心路。';
    }
    return blogType === 'bioai-daily'
        ? '本篇唯一问题：这项研究让一个普通人多明白了什么，它目前支持到哪一步？只留回答这件事必要的事实，不从头讲论文，不给医疗干预建议。'
        : '本篇唯一问题：这个工具或办法能帮普通人完成哪一件小事，怎样看出有没有做好？选择一个具体任务，不覆盖全部功能。';
}

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
