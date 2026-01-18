export function escapeYamlString(value) {
    if (value === null || typeof value === 'undefined') {
        return "''";
    }

    const normalized = String(value)
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const escaped = normalized.replace(/'/g, "''");
    return `'${escaped}'`;
}

export function buildAstroPaperFrontMatter(title, description, dateStr, tags) {
    const pubDatetime = `${dateStr}T01:00:00.000Z`; // UTC 01:00 = 北京 09:00
    const tagLines = (tags || []).map(tag => `  - ${tag}`).join('\n');

    return `---
title: ${escapeYamlString(title)}
pubDatetime: ${pubDatetime}
modDatetime: ${pubDatetime}
description: ${escapeYamlString(description)}
tags:
${tagLines}
draft: false
---

`;
}
