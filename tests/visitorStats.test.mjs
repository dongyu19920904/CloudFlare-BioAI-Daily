import assert from 'node:assert/strict';
import test from 'node:test';
import { handleVisitorStats } from '../src/handlers/visitorStats.js';

function createKv() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) || null;
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
}

test('handleVisitorStats increments pageviews and unique visitors', async () => {
  const env = { DATA_KV: createKv() };
  const url = 'https://worker.example/visitorStats?site=yuyu-home&visitor=test-visitor-1';

  const first = await handleVisitorStats(new Request(url, {
    headers: { Origin: 'https://yuyu.aivora.cn' },
  }), env);
  const firstData = await first.json();

  const second = await handleVisitorStats(new Request(url, {
    headers: { Origin: 'https://yuyu.aivora.cn' },
  }), env);
  const secondData = await second.json();

  assert.equal(first.status, 200);
  assert.equal(first.headers.get('Access-Control-Allow-Origin'), 'https://yuyu.aivora.cn');
  assert.equal(firstData.total.pageviews, 1);
  assert.equal(firstData.total.visitors, 1);
  assert.equal(secondData.total.pageviews, 2);
  assert.equal(secondData.total.visitors, 1);
});

test('handleVisitorStats responds to preflight requests', async () => {
  const response = await handleVisitorStats(new Request('https://worker.example/visitorStats', {
    method: 'OPTIONS',
    headers: { Origin: 'https://yuyu.aivora.cn' },
  }), { DATA_KV: createKv() });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});
