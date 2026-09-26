const ALLOWED_NEWS_HOSTS = new Set(["medicalxpress.com", "www.news-medical.net"]);
const DOI_REGEX = /10\.\d{4,9}\/[a-z0-9._;()/:+-]+/gi;
const MAX_HTML_BYTES = 350_000;
const MAX_JSON_BYTES = 250_000;
const TIMEOUT_MS = 8_000;

function doiCandidates(html) {
  const text = String(html || "").replace(/&quot;|&#34;/gi, '"').replace(/&amp;/gi, "&");
  const candidates = [...text.matchAll(DOI_REGEX)].map((match) => match[0].replace(/[.,;:)+-]+$/, "").toLowerCase());
  return [...new Set(candidates)].slice(0, 3);
}

async function fetchBounded(fetcher, url, accept, requiredType, maxBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: { Accept: accept, "User-Agent": "BioAI-Daily/1.0 (public research metadata)" },
    });
    if (!response.ok || response.redirected || !(response.headers.get("content-type") || "").includes(requiredType)) return null;
    if (Number(response.headers.get("content-length") || 0) > maxBytes) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) return null;
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}

/** Locate DOI candidates, never verify a medical claim from metadata alone. */
export async function discoverPrimarySourceCandidates(record, fetcher = fetch) {
  const found = [];
  for (const source of (record.source_urls || []).slice(0, 2)) {
    let url;
    try {
      url = new URL(source);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || !ALLOWED_NEWS_HOSTS.has(url.hostname) || url.port || url.username || url.password) continue;
    try {
      const html = await fetchBounded(fetcher, url.toString(), "text/html", "text/html", MAX_HTML_BYTES);
      if (!html) continue;
      for (const doi of doiCandidates(html)) {
        const apiUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
        const metadataText = await fetchBounded(fetcher, apiUrl, "application/json", "application/json", MAX_JSON_BYTES);
        if (!metadataText) continue;
        const metadata = JSON.parse(metadataText);
        const work = metadata?.message;
        if (String(work?.DOI || "").toLowerCase() !== doi || !Array.isArray(work.title) || !work.title[0]) continue;
        found.push({
          doi,
          url: `https://doi.org/${doi}`,
          title: String(work.title[0]).slice(0, 300),
          work_type: String(work.type || "unknown"),
          discovered_from: source,
          relationship_verified: false,
        });
      }
    } catch {
      // Discovery failure is not evidence of absence; the record remains pending.
    }
  }
  return [...new Map(found.map((item) => [item.doi, item])).values()];
}
