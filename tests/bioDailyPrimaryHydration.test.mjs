import assert from 'node:assert/strict';
import test from 'node:test';

import { inferDailyEvidence } from '../src/bioDailyEvidence.js';
import { hydrateDailyPrimaryEvidence } from '../src/bioDailyPrimaryHydration.js';

test('hydrates a selected DOI discovery item from the Europe PMC primary record', async () => {
    const requested = [];
    const fetchImpl = async (url) => {
        requested.push(String(url));
        return new Response(JSON.stringify({
            resultList: {
                result: [{
                    doi: '10.1038/example.2026',
                    title: 'Primary senescence paper',
                    abstractText: 'In vivo, inhibition reduced inflammation and improved healthspan in aged mice.',
                    firstPublicationDate: '2026-08-01',
                    source: 'MED',
                    journalInfo: { journal: { title: 'Nature' } },
                    pubTypeList: { pubType: ['Journal Article'] },
                }],
            },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const [candidate] = await hydrateDailyPrimaryEvidence([{
        title: 'Secondary report',
        url: 'https://news.example/report',
        sourceType: 'news',
        description: 'Original paper DOI 10.1038/example.2026',
        contentText: 'Secondary summary.',
        source: 'Example News',
        details: {},
    }], { DAILY_PRIMARY_HYDRATION_CAP: '2' }, fetchImpl);

    assert.equal(requested.length, 1);
    assert.match(requested[0], /www\.ebi\.ac\.uk\/europepmc/);
    assert.equal(candidate.sourceType, 'paper');
    assert.equal(candidate.url, 'https://doi.org/10.1038/example.2026');
    assert.equal(candidate.details.journal, 'Nature');
    assert.equal(candidate.details.discoveryUrl, 'https://news.example/report');
    assert.equal(inferDailyEvidence(candidate).studyType, '动物研究');
    assert.match(inferDailyEvidence(candidate).population, /小鼠/);
});

test('DOI hydration failures preserve the selected candidate and stay non-blocking', async () => {
    const original = {
        title: 'Secondary report',
        url: 'https://news.example/report',
        sourceType: 'news',
        description: 'DOI 10.1000/missing',
    };
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        const [candidate] = await hydrateDailyPrimaryEvidence(
            [original],
            { DAILY_PRIMARY_HYDRATION_CAP: '1' },
            async () => { throw new Error('network failure'); }
        );
        assert.deepEqual(candidate, original);
    } finally {
        console.warn = originalWarn;
    }
});
