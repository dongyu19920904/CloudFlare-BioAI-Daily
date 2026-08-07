import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBioDailySourceEnv } from '../src/bioDailyBudget.js';

test('ordinary daily source budgets override shared fan-out without mutating it', () => {
    const shared = {
        LONGEVITY_NEWS_MAX_FEEDS_PER_RUN: '11',
        LONGEVITY_SOCIAL_MAX_FEEDS_PER_RUN: '6',
        PAPERS_COOL_MAX_FEEDS_PER_RUN: '6',
        EUROPEPMC_MAX_QUERIES_PER_RUN: '4',
        PROJECT_MAX_QUERIES_PER_RUN: '6',
        DAILY_NEWS_MAX_FEEDS_PER_RUN: '6',
        DAILY_SOCIAL_MAX_FEEDS_PER_RUN: '2',
        DAILY_PAPERS_COOL_MAX_FEEDS_PER_RUN: '2',
        DAILY_EUROPEPMC_MAX_QUERIES_PER_RUN: '2',
        DAILY_PROJECT_MAX_QUERIES_PER_RUN: '2',
    };

    const daily = buildBioDailySourceEnv(shared);

    assert.deepEqual({
        news: daily.LONGEVITY_NEWS_MAX_FEEDS_PER_RUN,
        social: daily.LONGEVITY_SOCIAL_MAX_FEEDS_PER_RUN,
        papers: daily.PAPERS_COOL_MAX_FEEDS_PER_RUN,
        europePmc: daily.EUROPEPMC_MAX_QUERIES_PER_RUN,
        projects: daily.PROJECT_MAX_QUERIES_PER_RUN,
    }, {
        news: '6',
        social: '2',
        papers: '2',
        europePmc: '2',
        projects: '2',
    });
    assert.equal(shared.LONGEVITY_NEWS_MAX_FEEDS_PER_RUN, '11');
    assert.equal(shared.PROJECT_MAX_QUERIES_PER_RUN, '6');
});

test('ordinary daily defaults remain bounded when daily overrides are absent', () => {
    const daily = buildBioDailySourceEnv({
        LONGEVITY_NEWS_MAX_FEEDS_PER_RUN: '11',
        LONGEVITY_SOCIAL_MAX_FEEDS_PER_RUN: '6',
        PAPERS_COOL_MAX_FEEDS_PER_RUN: '6',
        EUROPEPMC_MAX_QUERIES_PER_RUN: '4',
        PROJECT_MAX_QUERIES_PER_RUN: '6',
    });

    assert.equal(daily.LONGEVITY_NEWS_MAX_FEEDS_PER_RUN, '6');
    assert.equal(daily.LONGEVITY_SOCIAL_MAX_FEEDS_PER_RUN, '2');
    assert.equal(daily.PAPERS_COOL_MAX_FEEDS_PER_RUN, '2');
    assert.equal(daily.EUROPEPMC_MAX_QUERIES_PER_RUN, '2');
    assert.equal(daily.PROJECT_MAX_QUERIES_PER_RUN, '2');
});
