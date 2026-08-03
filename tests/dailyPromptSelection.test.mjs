import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDailyPromptItemCap,
  resolveDailySourceCaps,
  selectDailyPromptCandidates,
  selectDailyPromptItems,
} from '../src/dailyPromptSelection.js';

test('daily item cap is always constrained to 3-8', () => {
  assert.equal(resolveDailyPromptItemCap({ DAILY_PROMPT_ITEM_CAP: '6' }), 6);
  assert.equal(resolveDailyPromptItemCap({ DAILY_PROMPT_ITEM_CAP: '18' }), 8);
  assert.equal(resolveDailyPromptItemCap({ DAILY_PROMPT_ITEM_CAP: '1' }), 3);
  assert.equal(resolveDailyPromptItemCap({ DAILY_PROMPT_ITEM_CAP: 'abc' }), 8);
  assert.equal(resolveDailyPromptItemCap({ DAILY_PROMPT_ITEM_CAP: '8', MANUAL_DAILY_PROMPT_ITEM_CAP: '4' }, true), 4);
});

test('legacy media helper still respects the new maximum', () => {
  assert.deepEqual(
    selectDailyPromptItems(['m1', 'm2'], ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'], 20),
    ['m1', 'm2', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']
  );
});

test('source caps favor papers and trustworthy news without requiring social filler', () => {
  assert.deepEqual(resolveDailySourceCaps({}), {
    news: 3,
    paper: 4,
    project: 2,
    socialMedia: 1,
  });
});

test('candidate selection ranks evidence, keeps paper/news diversity, and limits repeated topics', () => {
  const editorial = (qualityScore, topicKey, sourceAuthority = '一手/官方') => ({ qualityScore, topicKey, sourceAuthority });
  const candidates = [
    { key: 'p1', text: 'paper 1', sourceType: 'paper', editorial: editorial(80, 'clock'), publishedDate: '2026-08-03' },
    { key: 'p2', text: 'paper 2', sourceType: 'paper', editorial: editorial(70, 'clock'), publishedDate: '2026-08-02' },
    { key: 'p3', text: 'paper 3', sourceType: 'paper', editorial: editorial(69, 'clock'), publishedDate: '2026-08-01' },
    { key: 'n1', text: 'news 1', sourceType: 'news', editorial: editorial(65, 'dementia'), publishedDate: '2026-08-03' },
    { key: 'g1', text: 'project 1', sourceType: 'project', editorial: editorial(75, 'tool'), publishedDate: '2026-08-03' },
    { key: 's1', text: 'social 1', sourceType: 'socialMedia', editorial: editorial(10, 'other', '社交平台/待核实'), publishedDate: '2026-08-03' },
  ];

  const selected = selectDailyPromptCandidates(candidates, {}, 5);
  assert.equal(selected.length, 5);
  assert.ok(selected.some((candidate) => candidate.sourceType === 'paper'));
  assert.ok(selected.some((candidate) => candidate.sourceType === 'news'));
  assert.equal(selected.filter((candidate) => candidate.editorial.topicKey === 'clock').length, 2);
  assert.equal(selected[0].key, 'p1');
});
