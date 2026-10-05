export function getBlogPersonaSupplement(blogType) {
    return blogType === 'bioai-daily'
        ? '作者视角：认真学习 AI 生命延续学的项目探索者。用普通读者能理解的语言解释研究，不冒充医生或论文作者。'
        : '作者视角：用 AI 做项目、维护真实业务的实践者。关心任务、使用条件和维护代价，不要求从卖家视角写每一条新闻。';
}
export default getBlogPersonaSupplement;
