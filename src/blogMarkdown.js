// This guard is deliberately limited to literal regions, not a Markdown parser.
// Prose cleanup must never interpret code examples as actual links or headings.
export function protectBlogMarkdownLiterals(markdown) {
    const input = String(markdown || '');
    let prefix = '\uE000BLOG_LITERAL_';
    while (input.includes(prefix)) prefix += '_';
    const literals = [];
    const hide = value => `${prefix}${literals.push(value) - 1}\uE001`;
    const lines = input.match(/[^\n]*(?:\n|$)/g).filter(Boolean);
    const output = [];
    let unclosedFence = false;
    const clean = line => line.replace(/\r?\n$/, '');

    for (let i = 0; i < lines.length; i++) {
        const line = clean(lines[i]);
        const fence = line.match(/^(?: {0,3}> ?)* {0,3}(`{3,}|~{3,})(.*)$/);
        const metadata = i === 0 && line === '---';
        const formula = line.trim() === '$$';
        const indented = /^(?: {4}|\t)/.test(line);
        if (!fence && !metadata && !formula && !indented) {
            output.push(lines[i]);
            continue;
        }
        if (fence && fence[1][0] === '`' && fence[2].includes('`')) {
            output.push(lines[i]);
            continue;
        }
        const start = i;
        if (indented && !fence) {
            while (i + 1 < lines.length && (/^(?: {4}|\t)/.test(lines[i + 1]) || !clean(lines[i + 1]).trim())) i++;
        } else {
            while (++i < lines.length) {
                const next = clean(lines[i]);
                if (metadata && /^(---|\.\.\.)$/.test(next)) break;
                if (formula && next.trim() === '$$') break;
                const close = fence && next.match(/^(?: {0,3}> ?)* {0,3}(`+|~+)[ \t]*$/);
                if (close && close[1][0] === fence[1][0] && close[1].length >= fence[1].length) break;
            }
            if (fence && i === lines.length) unclosedFence = true;
            i = Math.min(i, lines.length - 1);
        }
        output.push(hide(lines.slice(start, i + 1).join('')));
    }

    const blocksProtected = output.join('');
    let text = '';
    for (let i = 0; i < blocksProtected.length;) {
        if (blocksProtected[i] !== '`') { text += blocksProtected[i++]; continue; }
        let slashes = 0;
        for (let k = i - 1; k >= 0 && blocksProtected[k] === '\\'; k--) slashes++;
        let endRun = i + 1;
        while (blocksProtected[endRun] === '`') endRun++;
        const delimiter = blocksProtected.slice(i, endRun);
        let close = endRun;
        let found = -1;
        while ((close = blocksProtected.indexOf('`', close)) >= 0) {
            let end = close + 1;
            while (blocksProtected[end] === '`') end++;
            const between = blocksProtected.slice(endRun, close);
            if (between.includes(prefix) || /\n[ \t\r]*\n/.test(between)) break;
            if (end - close === delimiter.length) { found = end; break; }
            close = end;
        }
        if (slashes % 2 === 0 && found >= 0) {
            text += hide(blocksProtected.slice(i, found));
            i = found;
        } else {
            text += delimiter;
            i = endRun;
        }
    }
    return {
        text,
        unclosedFence,
        restore(value) {
            let restored = value;
            for (let i = literals.length - 1; i >= 0; i--) restored = restored.split(`${prefix}${i}\uE001`).join(literals[i]);
            return restored;
        },
    };
}
