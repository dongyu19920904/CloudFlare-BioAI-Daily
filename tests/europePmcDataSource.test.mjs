import test from 'node:test';
import assert from 'node:assert/strict';

import { EuropePmcDataSource } from '../src/dataSources/europepmc.js';

test('Europe PMC uses the official API and keeps canonical primary-record metadata', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    const requested = [];
    globalThis.fetch = async (url) => {
        requested.push(String(url));
        return new Response(JSON.stringify({
            resultList: {
                result: [{
                    id: '12345',
                    pmid: '12345',
                    doi: '10.1000/TEST.DOI',
                    title: 'A controlled longevity study',
                    abstractText: 'Study abstract.',
                    firstPublicationDate: new Date().toISOString().slice(0, 10),
                    authorString: 'Example A',
                    journalTitle: 'Example Journal',
                    journalInfo: { journal: { title: 'Nested Journal' } },
                    source: 'MED',
                    pubTypeList: { pubType: ['Journal Article'] },
                }],
            },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const raw = await EuropePmcDataSource.fetch({
        EUROPEPMC_LONGEVITY_QUERIES: 'longevity|aging',
        EUROPEPMC_MAX_QUERIES_PER_RUN: '2',
        EUROPEPMC_FETCH_RESULTS: '8',
        EUROPEPMC_FETCH_DAYS: '30',
    });
    const items = EuropePmcDataSource.transform(raw, 'paper');

    assert.equal(requested.length, 2);
    assert.ok(requested.every((url) => url.startsWith('https://www.ebi.ac.uk/europepmc/webservices/rest/search?')));
    assert.ok(requested.every((url) => url.includes('resultType=core') && url.includes('format=json')));
    assert.equal(items.length, 1, 'duplicate DOI records from multiple queries are collapsed');
    assert.equal(items[0].url, 'https://doi.org/10.1000/test.doi');
    assert.equal(items[0].details.publicationStatus, 'journal record');
    assert.equal(items[0].details.journal, 'Example Journal');
    assert.deepEqual(items[0].details.publicationTypes, ['Journal Article']);
});

test('Europe PMC keeps nested journal metadata when journalTitle is absent', () => {
    const items = EuropePmcDataSource.transform({ items: [{
        id: 'NATURE1',
        doi: '10.1000/nature.test',
        articleUrl: 'https://doi.org/10.1000/nature.test',
        title: 'Aged mouse study',
        abstractText: 'In vivo work in aged mice.',
        publishedAt: '2026-08-01',
        source: 'MED',
        journalInfo: { journal: { title: 'Nature', medlineAbbreviation: 'Nature' } },
        pubTypeList: { pubType: ['Journal Article'] },
    }] }, 'paper');

    assert.equal(items[0].details.journal, 'Nature');
});

test('one Europe PMC query failure does not discard successful query results', async (t) => {
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    t.after(() => {
        globalThis.fetch = originalFetch;
        console.warn = originalWarn;
    });

    let requestCount = 0;
    console.warn = () => {};
    globalThis.fetch = async () => {
        requestCount += 1;
        if (requestCount === 1) throw new Error('temporary upstream failure');
        return new Response(JSON.stringify({
            resultList: {
                result: [{
                    id: 'PPR1',
                    doi: '10.1000/preprint',
                    title: 'Preliminary mouse study',
                    firstPublicationDate: new Date().toISOString().slice(0, 10),
                    source: 'PPR',
                    pubTypeList: { pubType: ['Preprint'] },
                }],
            },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const raw = await EuropePmcDataSource.fetch({
        EUROPEPMC_LONGEVITY_QUERIES: 'longevity|aging',
        EUROPEPMC_MAX_QUERIES_PER_RUN: '2',
        EUROPEPMC_FETCH_DAYS: '30',
    });
    const items = EuropePmcDataSource.transform(raw, 'paper');

    assert.equal(items.length, 1);
    assert.equal(items[0].details.publicationStatus, 'preprint');
});
