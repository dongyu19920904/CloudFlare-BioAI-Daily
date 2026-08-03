import test from 'node:test';
import assert from 'node:assert/strict';

import EuropePmcDataSource, { isBioAiResearchCandidate } from '../src/dataSources/europe-pmc.js';
import { getISODate, setFetchDate } from '../src/helpers.js';

const originalFetch = globalThis.fetch;
const originalFetchDate = getISODate();

test('Europe PMC source uses core results, keeps recent records, and preserves DOI/PMID metadata', async () => {
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      json: async () => ({
        resultList: {
          result: [
            {
              id: '12345678',
              pmid: '12345678',
              doi: '10.1000/recent.1',
              title: 'Machine learning biological age in a prospective cohort',
              firstPublicationDate: '2026-08-01',
              abstractText: 'A prospective cohort included 500 participants.',
              authorString: 'A. Researcher',
              journalTitle: 'Journal of Aging Data',
              pubTypeList: { pubType: ['research article'] },
            },
            {
              id: '11111111',
              pmid: '11111111',
              title: 'Old record',
              firstPublicationDate: '2024-01-01',
            },
            {
              id: '22222222',
              pmid: '22222222',
              title: 'SGLT2 inhibitors and cancer risk',
              firstPublicationDate: '2026-08-02',
              abstractText: 'A cohort of patients with diabetes was evaluated for cancer outcomes.',
            },
          ],
        },
      }),
    };
  };
  setFetchDate('2026-08-03');

  try {
    const raw = await EuropePmcDataSource.fetch({
      EUROPEPMC_LONGEVITY_QUERIES: '(aging) AND (machine learning)',
      EUROPEPMC_MAX_QUERIES_PER_RUN: '1',
      EUROPEPMC_FETCH_RESULTS: '12',
      EUROPEPMC_FETCH_DAYS: '30',
    });
    const transformed = EuropePmcDataSource.transform(raw, 'paper');
    assert.equal(transformed.length, 1);
    assert.equal(transformed[0].details.doi, '10.1000/recent.1');
    assert.equal(transformed[0].details.pmid, '12345678');
    assert.equal(transformed[0].details.sourceAuthority, '一手/官方');
    assert.match(transformed[0].url, /^https:\/\/doi\.org\//);
    assert.match(requestedUrl, /resultType=core/);
    assert.match(requestedUrl, /format=json/);
  } finally {
    globalThis.fetch = originalFetch;
    setFetchDate(originalFetchDate);
  }
});

test('Europe PMC relevance gate requires both an AI method and an aging context', () => {
  assert.equal(isBioAiResearchCandidate({
    title: 'Machine learning biological age in older adults',
    abstractText: 'An explainable model was evaluated in 500 participants.',
  }), true);
  assert.equal(isBioAiResearchCandidate({
    title: 'SGLT2 inhibitors and cancer risk',
    abstractText: 'A cohort study of patients with diabetes.',
  }), false);
  assert.equal(isBioAiResearchCandidate({
    title: 'Machine learning protein inhibitor design',
    abstractText: 'A model predicts binding selectivity for a human protein.',
  }), false);
});
