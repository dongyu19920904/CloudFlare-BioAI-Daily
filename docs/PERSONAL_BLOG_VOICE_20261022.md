# Personal Blog Voice and Source Handling

Scope: the two personal-blog jobs in `scheduledBlog.js`. BioAI daily and opportunity generation and their model routes are unchanged. Schedules and resource bindings are unchanged; the local personal-blog route choice is described below.

## Editorial Contract

- Write for an interested beginner, addressing one concrete question per article.
- Explain necessary terms when they first appear. Use concrete facts and actions, not a miniature research report.
- Author background is optional context. Do not fabricate experiences, customers, routines, financial figures or product test results.
- Give the reader a useful distinction, small action or original source to explore. No mandatory jokes, identity paragraphs or repeated closing summaries.
- Keep factual provenance separate from prose. A readable article still needs supported claims.

## Runtime Changes

`blogTopic.js` selects one relevant source section before writing. `blogSources.js` reads at most two supported original sources: public GitHub repository READMEs and identified arXiv abstracts. Requests have time and byte limits, redirects are not followed, and the GitHub credential is sent only to the GitHub API. Failed reads and truncated excerpts are explicit; reading a README does not independently verify product performance.

The prompt distinguishes secondary daily excerpts from retrieved originals. Source-backed access conditions can reject contradictory claims that model weights are freely available. This is a focused check, not a general factual-verification guarantee.

The model still writes once. Mild readability issues are warnings. Only severe failures use the existing single targeted repair. Preview generation does not write articles or KV status. Source metadata is returned without source text or credentials.

A broken upstream stream may make one non-streaming recovery call, discarding the partial response completely. Authentication failures do not enter this recovery. This is transport recovery, not a readability rewrite; existing lower-level provider retries still exist. Personal-blog output is capped at 6,000 tokens. Approved bare reference URLs are converted to Markdown links before the unchanged source qualification gate; missing or unapproved sources are not invented.

After the first complete draft failed editorial review, personal blogs were tested with the already configured Anthropic backup model. `getBlogWritingEnvironment` copies the environment for this call only; it does not mutate shared settings, change any credentials, or affect the daily/opportunity tasks. `BLOG_MODEL_ROUTE=primary` keeps the primary route, and absence of a configured backup credential leaves the original route unchanged. Model names are request configuration, not independently verified provider identity.

The dated author knowledge includes the verified October 22 publication recovery as optional material. It does not claim a complete new diary import, future reliability, or measured time savings.

## Acceptance

Read the complete real-model preview, not just its success flag. Check the opening, useful takeaway, term explanations, important facts, access conditions, source relevance and unrecorded first-person claims. Use the existing production version as rollback, compare its bindings/runtime/schedules before promotion, and never deploy an old repository baseline over unrelated work.

First-person current judgments are distinct from unsupported habits or remembered mistakes. The latter fail the existing severe gate. Extraction labels describe provenance, not a correctness guarantee; an unspecified research improvement must not become a large effect or an inference about clinical validity. The rule checks are deliberately partial: they cannot establish the truth or quality of every future sentence.

Research and detailed implementation evidence are maintained with the project analysis. Representative references include [Baoyu](https://baoyu.io/blog/2026-02-19/ai-writing-beyond-prompts), [Simon Willison](https://simonwillison.net/2024/Oct/17/video-scraping/), [Ethan Mollick](https://www.oneusefulthing.org/p/getting-started-with-ai-good-enough), and [humanizer](https://github.com/blader/humanizer). They inform editorial principles, not copied prose or borrowed author experiences. Unreadable X posts are not claimed as verified popularity measurements.
