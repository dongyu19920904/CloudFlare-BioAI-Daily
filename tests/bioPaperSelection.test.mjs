import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBioPaper, getArxivIdentity, selectBioPapers } from '../src/bioPaperSelection.js';

test('AI biological methods outrank background studies and generic cognition', () => {
  const assess = (title, description) => assessBioPaper({ title, description });
  assert.equal(assess('PharmAgents2', 'Multi-agent autonomous drug discovery with human-executed experiments.').priority, 2);
  assert.equal(assess('RIVER', 'LLM agents retrieve enzyme-reaction evidence on biochemical benchmarks.').priority, 2);
  assert.equal(assess('AI epigenetic clock', 'Machine learning predicts biological age from methylation.').priority, 3);
  assert.equal(assess('Single-cell atlas', 'Single-cell transcriptomics of healthy tissues.').priority, 1);
  assert.equal(assess('Spatial memory as a universal computer', 'Brain-inspired neural network models for machine cognition.').priority, 0);
  assert.equal(assess('Robot manipulation and cognition', 'A vision-language model for embodied robotics.').priority, 0);
  assert.equal(assess('Model pruning', 'AI pruning of artificial neurons; future applications may include drug discovery.').priority, 0);
  assert.equal(assess('AI crop detection', 'Deep learning classifies crop leaf disease.').priority, 0);
  assert.equal(assess('Evolver', 'Agent exploration builds structured Gene assets on Terminal-Bench and SWE-bench.').priority, 0);
  assert.equal(assess('Genetic search', 'A genetic algorithm optimizes AI software agents.').priority, 0);
  assert.equal(assess('MUSS', 'A sequence-based model learns single-cell gene regulation.').priority, 2);
});

test('direct biological tools precede medical dialogue and clinical operations', () => {
  const papers = [
    { title: 'Clinical dialogue', description: 'LLM medical dialogue tracks patient records.', published_date: '2026-11-06' },
    { title: 'PharmAgents2', description: 'Agents for drug discovery.', published_date: '2026-11-04' },
    { title: 'MUSS', description: 'Sequence-based model learns single-cell gene regulation.', published_date: '2026-11-05' },
  ];
  assert.deepEqual(selectBioPapers(papers).map(item => item.title), ['MUSS', 'PharmAgents2', 'Clinical dialogue']);
});

test('biological image cropping is not agriculture, but crop-only research stays excluded', () => {
  assert.equal(assessBioPaper({ title: 'AI cell segmentation', description: 'A neural network segments cropped single-cell microscopy images.' }).priority, 2);
  assert.equal(assessBioPaper({ title: 'Protein images', description: 'AI image cropping helps protein structure analysis.' }).priority, 2);
  assert.equal(assessBioPaper({ title: 'AI crop genomics', description: 'Machine learning predicts disease resistance in crops from genomic data.' }).priority, 0);
});

test('arXiv identity unifies category, PDF, version and legacy links without guessing', () => {
  for (const url of ['https://papers.cool/arxiv/2611.07757', 'http://arxiv.org/abs/2611.07757v2?x=1', 'https://arxiv.org/pdf/2611.07757v3.pdf']) {
    assert.equal(getArxivIdentity({ url }), '2611.07757');
  }
  assert.equal(getArxivIdentity({ url: 'https://arxiv.org/abs/q-bio/0601001v2' }), 'q-bio/0601001');
  for (const url of ['https://arxiv.org.evil.test/abs/2611.07757', 'https://papers.cool/arxiv/cs.AI/feed', 'https://example.org/2611.07757']) {
    assert.equal(getArxivIdentity({ url, title: '2611.07757' }), '');
  }
});

test('paper ordering uses relevance before media and dedupes known identities only', () => {
  const papers = [
    { url: 'https://example.org/robot', title: 'Robot cognition', description: 'AI robot learning', hasMedia: true },
    { url: 'https://papers.cool/arxiv/2611.07757', title: 'RIVER', description: 'LLM agents retrieve enzyme evidence.' },
    { url: 'https://arxiv.org/abs/2611.07757v2', title: 'RIVER revised', description: 'LLM agents retrieve enzyme evidence.' },
    { url: 'https://example.org/atlas', title: 'Single-cell atlas', description: 'Single-cell transcriptomics.', hasMedia: true },
  ];
  const selected = selectBioPapers(papers);
  assert.equal(selected.length, 3);
  assert.equal(getArxivIdentity(selected[0]), '2611.07757');
  assert.equal(selected[1].title, 'Single-cell atlas');
  assert.equal(selectBioPapers(papers, { relevantOnly: true }).length, 2);
  assert.equal(papers.length, 4, 'input remains unchanged');
});
