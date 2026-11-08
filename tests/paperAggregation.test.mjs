import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Keep the real aggregator and paper policy; replace every source I/O module.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/dataFetchers.js') && specifier.startsWith('./dataSources/')) {
      return { url: `fixture:${specifier}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.startsWith('fixture:')) return next(url, context);
    const source = `({type:${JSON.stringify(url)},fetch:async()=>globalThis.__paperAggregationFixture[${JSON.stringify(url)}]||[],transform:raw=>raw})`;
    return { format: 'module', shortCircuit: true, source: url.includes('longevity-rss')
      ? `export const PapersCoolDataSource=${source}; export const LongevityNewsRssDataSource=${source}; export const LongevitySocialRssDataSource=${source};`
      : `export default ${source};` };
  },
});
const { fetchAndTransformDataForType } = await import('../src/dataFetchers.js');
hooks.deregister();

test('paper aggregation dedupes cross-source arXiv identities and ranks relevance before type cap', async t => {
  globalThis.__paperAggregationFixture = {
    'fixture:./dataSources/longevity-rss.js': [
      { url: 'https://papers.cool/arxiv/2611.00001', title: 'AI drug discovery', description: 'LLM protein design.' },
      { url: 'https://papers.cool/arxiv/2611.00002', title: 'AI longevity clock', description: 'AI predicts biological age.' },
    ],
    'fixture:./dataSources/papers.js': [
      { url: 'https://arxiv.org/abs/2611.00001v2', title: 'Revised drug study', description: 'LLM protein design.' },
      { url: 'https://example.org/robot', title: 'Robot cognition', description: 'AI neural networks.', details: { content_html: '<img src="https://example.org/image.jpg">' } },
    ],
  };
  t.after(() => { delete globalThis.__paperAggregationFixture; });
  const result = await fetchAndTransformDataForType('paper', { MAX_ITEMS_PAPER: '2' });
  assert.deepEqual(result.map(item => item.title), ['AI longevity clock', 'AI drug discovery']);
});
