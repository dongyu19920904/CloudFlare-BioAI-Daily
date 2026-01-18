import assert from "node:assert/strict";
import { handleTestTriggerBlog } from "../src/handlers/testTriggerBlog.js";

const env = {
  TEST_TRIGGER_SECRET: "secret"
};

let waitUntilCalled = false;
const ctx = {
  waitUntil: (promise) => {
    waitUntilCalled = true;
    return promise;
  }
};

let handlerCalls = 0;
const handler = async () => {
  handlerCalls += 1;
  return { success: true };
};

const asyncRequest = new Request("https://example.com/testTriggerBlog?key=secret");
const asyncResponse = await handleTestTriggerBlog(asyncRequest, env, ctx, handler);
const asyncBody = await asyncResponse.json();

assert.equal(asyncResponse.status, 202);
assert.equal(asyncBody.async, true);
assert.equal(waitUntilCalled, true);
assert.equal(handlerCalls, 1);

waitUntilCalled = false;
const syncRequest = new Request("https://example.com/testTriggerBlog?key=secret&sync=1");
const syncResponse = await handleTestTriggerBlog(syncRequest, env, ctx, handler);
const syncBody = await syncResponse.json();

assert.equal(syncResponse.status, 200);
assert.equal(syncBody.async, false);
assert.equal(handlerCalls, 2);

console.log("testTriggerBlog async tests passed");
