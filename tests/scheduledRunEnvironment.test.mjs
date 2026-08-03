import test from 'node:test';
import assert from 'node:assert/strict';

import { createScheduledRunEnvironment } from '../src/scheduledRunEnvironment.js';

test('daily dry-run inherits bindings and overrides only publication state', () => {
  const binding = { get() {} };
  const env = { DATA_KV: binding, DAILY_DRY_RUN: 'false' };
  const runEnv = createScheduledRunEnvironment(env, 'daily', true);

  assert.notEqual(runEnv, env);
  assert.equal(runEnv.DATA_KV, binding);
  assert.equal(runEnv.DAILY_DRY_RUN, 'true');
  assert.equal(env.DAILY_DRY_RUN, 'false');
});

test('dry-run cannot alter opportunity tasks', () => {
  const env = { DAILY_DRY_RUN: 'false' };
  assert.equal(createScheduledRunEnvironment(env, 'opportunity', true), env);
  assert.equal(createScheduledRunEnvironment(env, 'project-opportunity', true), env);
  assert.equal(createScheduledRunEnvironment(env, 'daily', false), env);
});
