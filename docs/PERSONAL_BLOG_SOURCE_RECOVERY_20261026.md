# Personal Blog Source Recovery

Scope: personal-blog source recovery and the missing October 25 BioAI blog. Ordinary BioAI daily, opportunity and project handlers, shared model transport, resource bindings and schedules are unchanged relative to main `627b3453`. That baseline preserves the separately deployed opportunity-gate fix.

## Changes

- If the daily file is absent and the dated news cache has no sufficiently long entry, recover up to two existing, dated article URLs from explicitly supported News-Medical and MedicalXpress paths.
- HTTPS, hostname and path allowlists, no user-info or non-default ports, manual redirect refusal, an eight-second request timeout and a 256 KiB raw-body limit apply. Third-party article requests never receive GitHub or model credentials.
- HTMLRewriter extracts only configured article paragraphs. A source must still provide at least 500 characters to qualify for cached recovery; errors do not become invented content. The best recovered subject is used rather than combining unrelated short reports.
- Reuse successful in-memory source receipts during generation. Recovery does not change the source cache or trigger source ingestion or other daily jobs.
- Distinguish an empty cache from a filtered cache in personal-blog diagnostics.
- An internal `previewType` option is valid only with `dryRun`. It permits a BioAI-only preview without regenerating an existing AI article. Production publishing retains the existing two-job idempotency checks.
- Real previews found that the blog-preferred backup returned HTTP 401 while the already configured primary worked. Only the personal-blog wrapper may try that distinct primary once after backup HTTP 401/403. It discards partial output, disables the failed backup for that recovery call, and does not change shared credentials, routes or bindings. The same unauthorized route is not retried.

## Verification Boundaries

Fixture tests cover parsing delegation, accepted/rejected URL paths, request/byte bounds, duplicate and future sources, unchanged cache data, diagnostics, no GitHub/KV writes during preview, single-type selection and bounded authentication recovery. Parser fixtures are not real DOM execution; an inactive Worker separately tested the actual HTMLRewriter against the original sites.

The real Worker read 3,691 characters from News-Medical. MedicalXpress returned HTTP 403 in the Worker and was recorded as unavailable; it was not used as evidence or bypassed. The preferred backup's first preview failed with 401; the separately configured primary produced a complete draft. The publication draft is editorially corrected to avoid equating the explained variation of common genetic variants with the entire genetic contribution to personality. No personal experience is added.

The missing article is published through the frontend's existing Git/Pages path using the reviewed text, not a second model generation. The AI article blob must remain `bb4c82da8c2e0f5f0470cead51b9cd0cbac0ba67`.

Detailed source, preview and release receipts live in the project analysis directory alongside `09-十月二十五日素材回退修复.md`. They distinguish fixture checks, actual previews, authored edits and the final deployment rather than treating a passing machine flag as an editorial review.
