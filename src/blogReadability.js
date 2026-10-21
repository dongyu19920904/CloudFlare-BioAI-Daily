const terms = [
    'AST', 'SQL', 'CASP', 'GMR', 'LoRA', 'MRI', 'NfL',
    '向量检索', '冻结嵌入', '嵌入', '预训练', '微调', '迁移学习',
    '门控混合递归', '元编程', '运行时反射', '基线校正', '统计显著性',
];

function proseOnly(body) {
    return String(body || '')
        .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
        .replace(/^~~~[^\n]*\n[\s\S]*?^~~~\s*$/gm, '')
        .split(/^##\s+(?:参考资料|references)\s*$/im)[0]
        .replace(/!\[[^\]]*]\([^\s)]+\)/g, '')
        .replace(/!?\[([^\]]*)]\([^\s)]+\)/g, '$1')
        .replace(/`[^`]+`|https?:\/\/\S+/g, '');
}

export function assessBlogReadability(body) {
    const prose = proseOnly(body);
    const found = [];
    for (const term of terms) {
        const match = new RegExp(/[A-Za-z]/.test(term) ? `\\b${term}\\b` : term, 'i').exec(prose);
        if (!match) continue;
        if (found.some(item => match.index >= item.index && match.index + term.length <= item.index + item.term.length)) continue;
        const nearby = prose.slice(Math.max(0, match.index - 20), match.index + term.length + 75);
        if (/就是|可以理解|你可以|比如|例如|用来|相当于|简单理解|先不用记|意思是|也就是/.test(nearby)) continue;
        found.push({ term, index: match.index });
    }
    const opening = found.filter(item => item.index < 220);
    const warnings = found.length >= 3 ? [`unexplained_terms:${found.map(item => item.term).join(',')}`] : [];
    const severe = opening.length >= 5 || found.length >= 10 ? ['jargon_wall'] : [];
    const stock = prose.match(/值得注意的是|这里需要分清楚一个层次|我的判断是|一个值得核验的点是|结构性关联|具有重要意义|综上所述/g) || [];
    if (stock.length >= 3) warnings.push(`report_style:${stock.length}`);
    return { severe, warnings };
}
