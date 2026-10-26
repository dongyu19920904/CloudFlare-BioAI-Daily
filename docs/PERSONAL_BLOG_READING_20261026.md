# Personal Blog Writing and Markdown

Scope: personal-blog reuse only. The ordinary BioAI daily, opportunity and project handlers, source ingestion, schedules, shared model transport and credentials are unchanged.

`getBlogPrompt` now identifies writing rules as `2026-10-26.1`. The existing generation and targeted-repair requests both receive that version. Short essays may remain unsectioned; practical articles can use a few reader-led sections, real steps and copyable text rather than a fixed report outline. Numbers retain units and conditions, and a token limit is not converted into a guaranteed Chinese-character or book count. Author experiences still require existing evidence.

`blogMarkdown.js` is a conservative literal-region guard, not a new Markdown renderer or a general-purpose parser. It protects supported fenced, quoted-fenced, inline and indented code, leading YAML and display-formula regions before the existing prose cleanup, then restores their bytes. Tests cover delimiter length, unclosed fences, token collisions, unchanged URLs/numbers/metadata and repeated normalization. An unclosed code fence is a severe defect handled by the existing one-repair limit; it cannot publish as a half-open article.

No additional model review or formatter service is introduced. Fixture previews exercise each blog type through the actual handler and API payload: a mild warning uses one mocked generation; persistent severe defects stop after one mocked repair without GitHub or KV writes. External network is denied during the test run. Real generation quality, token usage and production deployment are not claimed by these mocks.

The matching frontend keeps Astro's existing renderer and native article CSS. Its HAST transform adds an opening-paragraph role and accessible table wrappers without rewriting article text or metadata. A/D share this Worker repository; combine their separately scoped branches before any authorized single release, rather than independently overwriting the production version.

Local backend verification: `node --require ./tests/helpers/deny-network.cjs --test tests/*.test.mjs tests/*.test.js` passed 279 tests. Frontend integration, resource choices and internal samples are documented in `astro-paper/docs/content-quality-20261026/`. Existing API source and health publication gates remain active.
