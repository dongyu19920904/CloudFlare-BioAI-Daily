import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { requestBlogTrigger } from '../scripts/personal-blog-guard.mjs';

function client(send) {
    return (url, options, receive) => {
        const req = new EventEmitter();
        req.destroy = () => req.emit('error', new Error('private transport details'));
        options.signal.addEventListener('abort', () => req.destroy(), { once: true });
        req.end = () => {
            const response = new EventEmitter();
            response.statusCode = 200;
            receive(response);
            queueMicrotask(() => send(response));
        };
        return req;
    };
}

test('blog trigger retains the explicit full deadline and returns complete split JSON', async () => {
    const result = await requestBlogTrigger(new URL('https://approved.invalid/testTriggerBlog?key=never-log'), { request: client(response => {
        response.emit('data', Buffer.from('{"success":'));
        response.emit('data', Buffer.from('true}'));
        response.emit('end');
    }) });
    assert.deepEqual(result, { status: 200, payload: { success: true } });
});

test('timeout, oversized or malformed output fail without logging the secret URL', async () => {
    for (const options of [
        { request() { throw new Error('private request setup'); } },
        { timeoutMs: 5, request: client(() => {}) },
        { request: client(response => { response.emit('data', Buffer.alloc(2097153)); }) },
        { request: client(response => { response.emit('data', Buffer.from('<html>failure</html>')); response.emit('end'); }) },
    ]) await assert.rejects(requestBlogTrigger('https://approved.invalid/?key=never-log', options), error => /do not blindly retry/.test(error.message) && !error.message.includes('never-log'));
});
