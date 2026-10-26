const SECTIONS = new Set(['daily', 'opportunity', 'project-opportunity']);
export const BIO_REPORT_PRESENTATION_VERSION = 'bioai-spacing/2026-10-26.1';

// This is a spacing pass, not a second Markdown parser or a content rewriter.
// Keep opaque blocks intact; Hugo/Goldmark remains the actual renderer.
function scanBlocks(markdown) {
  const lines = String(markdown).split('\n');
  const protectedLines = new Set();
  const errors = [];
  const first = lines[0]?.replace(/\r$/, '');
  const frontmatter = /^(?:---|\+\+\+)$/.test(first || '')
    && /^\s*[\w-]+\s*[:=]/.test(lines.slice(1).find(line => line.trim()) || '');
  let block = frontmatter ? { type: 'frontmatter', end: first, line: 1 } : null;
  for (const [index, raw] of lines.entries()) {
    const line = raw.replace(/\r$/, '');
    if (block) {
      protectedLines.add(index);
      if (index + 1 > block.line) {
        const closed = block.type === 'fence'
          ? new RegExp(`^ {0,3}${block.character}{${block.length},}\\s*$`).test(line)
          : block.type === 'html'
            ? new RegExp(`</${block.tag}\\s*>`, 'i').test(line)
            : line.trim() === block.end;
        if (closed) block = null;
      }
      continue;
    }
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    const html = /^\s*<(pre|script|style|textarea|code)(?:\s|>)/i.exec(line);
    if (fence) block = { type: 'fence', character: fence[1][0], length: fence[1].length, line: index + 1 };
    else if (/^\s*(?:\$\$|\\\[)\s*$/.test(line)) block = { type: 'math', end: line.trim() === '$$' ? '$$' : '\\]', line: index + 1 };
    else if (html && !new RegExp(`</${html[1]}\\s*>`, 'i').test(line)) block = { type: 'html', tag: html[1], line: index + 1 };
    if (block || /^(?: {4}|\t)/.test(line) || html) protectedLines.add(index);
  }
  if (block) errors.push({ rule: `unclosed_${block.type}`, line: block.line });
  const protectedBlocks = [];
  let chunk = [];
  for (let index = 0; index <= lines.length; index++) {
    if (protectedLines.has(index)) chunk.push(lines[index]);
    else if (chunk.length) { protectedBlocks.push(chunk.join('\n')); chunk = []; }
  }
  return { lines, protectedLines, protectedBlocks, errors };
}

export function inspectBioReportMarkdown(markdown, section) {
  if (!SECTIONS.has(section)) throw new Error('Unsupported BioAI report section');
  const scan = scanBlocks(markdown);
  const warnings = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      const text = paragraph.map(item => item.text).join('');
      if ((text.match(/\p{Script=Han}/gu) || []).length > 300 || text.length > 900) {
        warnings.push({ rule: 'long_paragraph', line: paragraph[0].line });
      }
      paragraph = [];
    }
  };
  for (const [index, line] of scan.lines.entries()) {
    if (scan.protectedLines.has(index) || !line.trim() || /^#{1,6}\s/.test(line)) flush();
    else if (/^\s*(?:[-+*]|\d+\.)\s+/.test(line)) {
      flush();
      paragraph.push({ text: line, line: index + 1 });
      flush();
    }
    else paragraph.push({ text: line, line: index + 1 });
  }
  flush();
  return { errors: scan.errors, warnings: warnings.slice(0, 10) };
}

export function normalizeBioReportSpacing(markdown) {
  const source = String(markdown);
  const { lines, protectedLines } = scanBlocks(source);
  const empty = source.includes('\r\n') ? '\r' : '';
  const result = [];
  for (const [index, line] of lines.entries()) {
    if (!protectedLines.has(index) && /^#{2,6}\s+\S/.test(line)) {
      if (result.length && result.at(-1).trim()) result.push(empty);
      result.push(line);
      if (index + 1 < lines.length && lines[index + 1].trim()) result.push(empty);
    } else result.push(line);
  }
  return result.join('\n');
}

function assertStructure(markdown, section) {
  const result = inspectBioReportMarkdown(markdown, section);
  if (result.errors.length) throw new Error(`BioAI report format blocked: ${result.errors[0].rule}`);
  return result;
}

export function formatApprovedBioReport(markdown, { section, validate, formatter = normalizeBioReportSpacing }) {
  if (typeof validate !== 'function') throw new Error('Publication validation is required before formatting');
  const original = String(markdown);
  if (validate(original) === false) throw new Error('BioAI report did not pass publication validation');
  const originalInspection = assertStructure(original, section);
  try {
    const formatted = formatter(original);
    if (typeof formatted !== 'string' || formatted.replace(/\r?\n/g, '') !== original.replace(/\r?\n/g, '')) {
      throw new Error('Formatting attempted to change report content');
    }
    const contentLines = text => text.split('\n').filter(line => line.trim()).join('\n');
    if (contentLines(formatted) !== contentLines(original)) {
      throw new Error('Formatting attempted to split or merge a content line');
    }
    if (JSON.stringify(scanBlocks(formatted).protectedBlocks) !== JSON.stringify(scanBlocks(original).protectedBlocks)) {
      throw new Error('Formatting attempted to change a protected block');
    }
    const inspection = assertStructure(formatted, section);
    if (validate(formatted) === false) throw new Error('Formatted report did not pass publication validation');
    return { markdown: formatted, status: formatted === original ? 'unchanged' : 'formatted', version: BIO_REPORT_PRESENTATION_VERSION, warnings: inspection.warnings };
  } catch {
    return { markdown: original, status: 'original_approved', version: BIO_REPORT_PRESENTATION_VERSION, warnings: [...originalInspection.warnings.slice(0, 9), { rule: 'format_fallback', line: 1 }] };
  }
}
