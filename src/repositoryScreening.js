const MAX_BYTES = 120_000;
const TIMEOUT_MS = 7_000;

function repositoryName(record) {
  for (const source of record.source_urls || []) {
    try {
      const url = new URL(source);
      if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password) continue;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) continue;
      const owner = parts[0];
      const repo = parts[1].replace(/\.git$/i, "");
      if (!/^[a-z0-9-]{1,39}$/i.test(owner) || !/^[a-z0-9_.-]{1,100}$/i.test(repo)) continue;
      return `${owner}/${repo}`;
    } catch { /* Ignore malformed source links. */ }
  }
  return null;
}

export async function screenRepository(record, fetcher = fetch) {
  const name = repositoryName(record);
  if (!name) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(`https://api.github.com/repos/${name}`, {
      signal: controller.signal,
      redirect: "manual",
      headers: { Accept: "application/vnd.github+json", "User-Agent": "BioAI-Daily/1.0" },
    });
    if (!response.ok || response.redirected || !(response.headers.get("content-type") || "").includes("application/json")) return null;
    if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) return null;
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const result = JSON.parse(new TextDecoder().decode(bytes));
    if (result.full_name?.toLowerCase() !== name.toLowerCase() || result.private) return null;
    const license = result.license?.spdx_id;
    return {
      repository: result.full_name,
      url: result.html_url,
      default_branch: result.default_branch || null,
      archived: result.archived === true,
      disabled: result.disabled === true,
      pushed_at: result.pushed_at || null,
      license_spdx: license && license !== "NOASSERTION" ? license : null,
      screening_status: "metadata_found",
      data_verified: false,
      run_verified: false,
      commercial_use_verified: false,
    };
  } catch {
    return null;
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}
