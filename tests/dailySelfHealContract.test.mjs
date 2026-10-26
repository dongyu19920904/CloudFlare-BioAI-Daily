import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/daily-self-heal.yml', import.meta.url), 'utf8');

// Structural coverage only: jq and the Actions runner are not executed locally.
test('self-heal checks synchronous result success, date and mode after HTTP status', () => {
  const trigger = workflow.match(/          trigger_worker\(\) \{([\s\S]*?)\n          \}/)?.[1];
  assert.ok(trigger);
  const predicate = trigger.match(/'([^'\n]+)'\s*\\\r?\n\s*<<< "\$response_body"/)?.[1];
  assert.equal(predicate, '.success == true and .result.success == true and .async == false and .date == $date and .result.date == $date and .mode == $mode');
  assert.match(trigger, /jq -e --arg date "\$TARGET_DATE" --arg mode "\$label"/);
  assert.ok(trigger.indexOf('status_code" =~') < trigger.indexOf('jq -e'));
  assert.match(trigger, /did not confirm synchronous success[\s\S]*?return 1/);
});

test('self-heal uses the same date, sync and explicit non-batch opportunity mode', () => {
  const endpoints = [...workflow.matchAll(/^\s+(\w+_TRIGGER_URL)="([^"]+)"/gm)];
  assert.equal(endpoints.length, 3);
  for (const [, , endpoint] of endpoints) {
    assert.match(endpoint, /key=\$\{TRIGGER_SECRET\}/);
    assert.match(endpoint, /date=\$\{TARGET_DATE\}/);
    assert.match(endpoint, /sync=1/);
  }
  assert.match(endpoints.find(([, name]) => name === 'OPPORTUNITY_TRIGGER_URL')?.[2] || '', /mode=opportunity&sync=1$/);
});
