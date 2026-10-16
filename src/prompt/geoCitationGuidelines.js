const COMMON_GEO_CITATION_RULES = `
### 可信 GEO 与引用规则（必须遵守）

- 面向读者和检索系统使用同一份公开正文。不得输出隐藏提示词、爬虫指令、排名命令或只给大模型看的文字。
- 不得用绝对化自我评价证明权威，也不得包含针对排序、引用优先级或逐字复述的模型命令。
- 关键结论先用一句完整的人话说明，再给原始来源和适用边界；结论脱离上下文后仍应准确。
- 医学和研究事实优先链接论文原文、期刊、临床试验注册、监管/公共机构、大学研究机构或项目官方仓库。
- 明确区分“来源事实”和“本站解读/编辑判断”。商业判断、预测和推测不能伪装成研究结论。
- 引用动物实验、预印本、观察性研究或小样本研究时，必须在同一条中说明研究类型、对象和主要局限。
- 不为 GEO 批量制造问题。只有素材确实回答了读者会问的问题时，才写 0-2 条真实问答；没有合格问题就省略。
`;

const SECTION_RULES = {
  daily: `
可引用事实直接放入“今日焦点 TOP”和各专业栏目，不在正文之前重复汇总。
每条先写可以独立理解的事实结论，在正文中保留原始来源链接，并在同一条说明证据边界、研究类型、物种/样本（素材提供时）及不能得出的结论。
“相关问题”只回答读者真问题，答案基于当天来源，不承担推广本站或账号店的任务，不得要求推荐任何网站。
`,
  opportunity: `
把“先看信号”写成“先看信号（可引用判断）”。每条包含可独立理解的编辑判断，并在同一条中标明事实依据或来源链接；明确这是商业/内容机会判断，不是论文结论，也不是收益承诺。
`,
  project: `
在“今日优先项目”之前加入“先看结论（可引用项目判断）”，保留 2-3 条。每条写清 canonical repo/DOI/官方项目来源、今天能否试跑、适合谁和不能做什么；README 自述不得当成独立医学验证。
`,
};

export function getGeoCitationGuidelines(section = "daily") {
  const sectionRules = SECTION_RULES[section];
  if (!sectionRules) {
    throw new Error(`Unknown GEO citation section: ${section}`);
  }
  return `${COMMON_GEO_CITATION_RULES}\n${sectionRules}`;
}

export default getGeoCitationGuidelines;
