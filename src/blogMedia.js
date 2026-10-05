function url(value) {
    try {
        const parsed = new URL(value);
        return /^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : null;
    } catch { return null; }
}

function links(markdown) {
    return [...String(markdown || '').matchAll(/(!?)\[([^\]\n]+)]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g)]
        .map(match => ({ image: match[1] === '!' || /^图片\s*[:：]/.test(match[2]), label: match[2].replace(/^图片\s*[:：]\s*/, '').trim(), url: url(match[3]) }))
        .filter(link => link.url);
}

function sections(markdown) {
    const result = [];
    let block = [], fenced = false;
    for (const line of String(markdown || '').split(/\r?\n/)) {
        if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
        if (fenced) continue;
        if (/^#{1,6}\s|^\s*(---|\*\*\*)\s*$/.test(line)) {
            if (block.length) result.push(block.join('\n'));
            block = [];
        }
        block.push(line);
    }
    if (block.length) result.push(block.join('\n'));
    return result;
}

export function selectReferencedSourceMedia(dailyContent, body, limit = 2) {
    const cited = new Set(links(body).filter(link => !link.image).map(link => link.url));
    const selected = [], seenImages = new Set(), seenSources = new Set();
    for (const block of sections(dailyContent)) {
        if (/utm_campaign|卡密秒发|自助下单/.test(block)) continue;
        const items = links(block);
        // An unambiguous source section, not a roundup with unrelated images.
        const sources = [...new Map(items.filter(link => !link.image).map(link => [link.url, link])).values()];
        if (sources.length !== 1 || !cited.has(sources[0].url) || seenSources.has(sources[0].url)) continue;
        const image = items.find(link => link.image && link.label
            && !/^(图片|配图|图|image|img|photo|screenshot)(?:\.(?:png|jpe?g|webp))?$/i.test(link.label)
            && !/news-medical\.net\/image-handler\/picture\//i.test(link.url)
            && /\.(png|jpe?g|webp|gif|avif)(?:\?|#|$)/i.test(link.url) && !seenImages.has(link.url));
        if (!image) continue;
        selected.push({ imageUrl: image.url, alt: `来源配图：${image.label}`, sourceUrl: sources[0].url, sourceTitle: sources[0].label });
        seenImages.add(image.url);
        seenSources.add(sources[0].url);
        if (selected.length >= Math.min(2, Math.max(0, limit))) break;
    }
    return limit > 0 ? selected : [];
}

export function addReferencedSourceMedia(body, dailyContent) {
    if (/!\[[^\]]*]\(/.test(body) || /<img\b/i.test(body)) return body;
    const images = selectReferencedSourceMedia(dailyContent, body);
    let result = body;
    for (const [position, image] of images.entries()) {
        const label = image.alt.replace(/[\[\]\n]/g, '').slice(0, 160);
        const figure = `[![${label}](${image.imageUrl})](${image.sourceUrl})`;
        const paragraphs = result.split(/\n\s*\n/);
        let inReferences = false;
        const index = paragraphs.findIndex(paragraph => {
            if (/^##\s+(?:参考资料|references)/i.test(paragraph)) inReferences = true;
            return !inReferences && !/^\s*(?:#|!|\[!)/.test(paragraph) && links(paragraph).some(link => !link.image && link.url === image.sourceUrl);
        });
        if (index >= 0) {
            paragraphs.splice(index + 1, 0, figure);
            result = paragraphs.join('\n\n');
        } else {
            if (position === 0) {
                const opening = paragraphs.findIndex(paragraph => !/^\s*(?:#|>|[-*]|\d+\.)/.test(paragraph));
                if (opening >= 0) {
                    paragraphs.splice(opening + 1, 0, figure);
                    result = paragraphs.join('\n\n');
                    continue;
                }
            }
            const references = result.search(/^##\s+(?:参考资料|references)/im);
            result = references < 0 ? `${result.trim()}\n\n${figure}` : `${result.slice(0, references).trim()}\n\n${figure}\n\n${result.slice(references)}`;
        }
    }
    return result;
}
