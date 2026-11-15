export function getBlogReaderBrief(material, blogType) {
    return blogType === 'bioai-daily'
        ? '通读本期各项研究，挑几件能互相说明、对比或提出不同问题的材料来写。分清动物机制、关联性观察与人体试验各自回答什么，不将不同研究拼成已证实的延寿路线。脑年龄估计和疾病分类是不同任务，不相互推导。不教读者上传医疗资料或调整用药。'
        : '先看完整日报各栏目，再决定今天什么变化值得普通人关心。用几件独立材料说明自己的取舍，解释它们之间真实的联系或差别；无关联就明确分开，不能为了主线编造行业趋势。不要因出现 Codex、Claude Code 或 Cursor 又写成检查调用关系。';
}

export function selectBlogWritingMaterial(dailyContent) {
    // Keep the complete daily: source scoring must not narrow the writing input to one story.
    const text = String(dailyContent || '');
    if (text.length > 80000) throw new Error('Personal blog daily exceeds complete-input limit; no silent truncation');
    return text;
}
