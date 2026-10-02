import knowledge from './blogAuthorKnowledge.json' with { type: 'json' };

export const BLOG_AUTHOR_KNOWLEDGE_VERSION = knowledge.version;

export function getBlogAuthorKnowledge() {
    const focus = knowledge.currentFocus.map(item => `- [${item.status}] ${item.title}：${item.text}`).join('\n');
    const milestones = knowledge.milestones.map(item => `- ${item.date} [${item.status}] ${item.title}：${item.text}`).join('\n');
    return `
## 作者当前资料（核对至 ${knowledge.updatedAt}）

这是对旧历史的补充。当前状态以本节为准；日期是资料核对日期，不是文章当天的新经历。
${knowledge.summary}

### 当前重点
${focus}

### 有日期的阶段记录
${milestones}

### 真实性与隐私
${knowledge.boundaries.map(item => `- ${item}`).join('\n')}
- 不公开或推测个人收入、营业额、利润、增速、成本、利润率或资产数字，也不写可反推金额的区间；只能概括为业务规模较年初明显增长。
- 日记待办、AI 建议、候选项目、传播目标不等于已完成。旧档案中的状态不可改写为今天发生；日报中的外部事件也不是我的第一手经历。
- 不编造客户、订单、生活场景或实验参与；不公开私人日记原文、来源标识、客户信息和采购渠道。
`;
}
