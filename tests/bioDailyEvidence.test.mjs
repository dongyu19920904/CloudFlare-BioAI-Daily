import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDailyCandidateIdentity,
  getDailyCandidateDedupeKeys,
  hasDailyPrimarySource,
  inferDailyEvidence,
  normalizeCanonicalUrl,
  resolveDailyPrimarySource,
} from '../src/bioDailyEvidence.js';

test('normalizes discovery, DOI, trial and GitHub URLs to canonical identities', () => {
  assert.equal(normalizeCanonicalUrl('https://papers.cool/arxiv/2608.03145?utm_source=x'), 'https://arxiv.org/abs/2608.03145');
  assert.equal(normalizeCanonicalUrl('https://doi.org/10.1038/TEST.1?utm_source=x'), 'https://doi.org/10.1038/test.1');
  assert.equal(normalizeCanonicalUrl('https://github.com/Owner/Repo.git/issues/2'), 'https://github.com/owner/repo');

  const identity = buildDailyCandidateIdentity({
    title: 'Trial update',
    url: 'https://clinicaltrials.gov/study/NCT06750432?utm_source=x',
    text: 'DOI 10.1000/ABC.1',
  });
  assert.equal(identity.trialId, 'NCT06750432');
  assert.equal(identity.doi, '10.1000/abc.1');
});

test('dedupe keys cover DOI, trial, repo, arXiv and event entity', () => {
  const keys = getDailyCandidateDedupeKeys({
    title: 'AI model tracks biological age in a prospective cohort',
    url: 'https://arxiv.org/abs/2608.03145',
    text: 'Registered as NCT06750432 and mirrored at https://github.com/Owner/Repo',
  });
  assert.ok(keys.includes('arxiv:2608.03145'));
  assert.ok(keys.includes('trial:NCT06750432'));
  assert.ok(keys.includes('repo:owner/repo'));
  assert.ok(keys.some((key) => key.startsWith('entity:')));
});

test('resolves primary sources independently from discovery pages', () => {
  const candidate = {
    title: 'Media report about an aging cohort',
    url: 'https://news.example/story',
    description: 'The paper DOI is 10.1000/aging.2026.',
  };
  assert.equal(resolveDailyPrimarySource(candidate), 'https://doi.org/10.1000/aging.2026');
  assert.equal(hasDailyPrimarySource(candidate), true);
  assert.equal(hasDailyPrimarySource({ title: 'Aging report', url: 'https://news.example/story' }), false);
});

test('preprints, animal and benchmark work cannot exceed preliminary evidence', () => {
  const evidence = inferDailyEvidence({
    title: 'Mouse longevity benchmark',
    url: 'https://arxiv.org/abs/2608.03145',
    text: 'A benchmark study in 120 mice',
  });
  assert.equal(evidence.evidenceLevel, '初步');
  assert.match(evidence.studyType, /动物|基准/);
  assert.match(evidence.population, /小鼠/);
  assert.match(evidence.publicationStatus, /预印本/);
});

test('word fragments such as separating and stratification are not classified as rats', () => {
  const evidence = inferDailyEvidence({
    title: 'Separating within-person changes from population stratification',
    url: 'https://doi.org/10.1007/example',
    sourceType: 'paper',
    description: 'A longitudinal study of 450 adults and patients.',
    details: { publicationStatus: 'journal record' },
  });
  assert.equal(evidence.studyType, '人体观察性/队列研究');
  assert.match(evidence.population, /人类\/人体样本/);
  assert.doesNotMatch(evidence.population, /大鼠/);
  assert.match(evidence.publicationStatus, /期刊记录/);
});

test('Europe PMC PPR and Research Square records remain explicitly preprints', () => {
  const evidence = inferDailyEvidence({
    title: 'External validation across two populations',
    url: 'https://doi.org/10.21203/rs.3.rs-10576447/v1',
    sourceType: 'paper',
    details: { publicationStatus: 'preprint', sourceDatabase: 'PPR' },
  });
  assert.equal(evidence.evidenceLevel, '初步');
  assert.match(evidence.publicationStatus, /预印本/);
});

test('animal study labels cannot be overwritten by human terms mentioned in context', () => {
  const evidence = inferDailyEvidence({
    title: 'Mouse model compared with prior patient observations',
    url: 'https://doi.org/10.1000/mouse-study',
    sourceType: 'paper',
    description: 'The experiment used mice and discusses earlier patients.',
  });
  assert.equal(evidence.studyType, '动物研究');
  assert.match(evidence.population, /^小鼠/);
  assert.equal(evidence.evidenceLevel, '初步');
});

test('randomized sampling inside a cohort is not upgraded to a randomized trial', () => {
  const evidence = inferDailyEvidence({
    title: 'A pace of aging clock from an offspring cohort',
    url: 'https://doi.org/10.1000/cohort-clock',
    sourceType: 'paper',
    description: 'A randomized sample was drawn from a longitudinal cohort of 900 adults.',
  });
  assert.equal(evidence.studyType, '人体观察性/队列研究');
  assert.equal(evidence.evidenceLevel, '初步');
});

test('secondary news without a clear design stays a news item rather than a guessed trial', () => {
  const evidence = inferDailyEvidence({
    title: 'Aging clocks are tools, not verdicts',
    url: 'https://example.com/aging-clock-interview',
    sourceType: 'news',
    description: 'The interview mentions several clinical trials and patient cohorts.',
  });
  assert.match(evidence.studyType, /^新闻\/机构动态/);
  assert.equal(evidence.evidenceLevel, '初步');
});
