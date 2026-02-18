import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLinuxDoPolicy } from '../src/sourcePolicies.js';

test('applyLinuxDoPolicy caps linux.do items and strips media by default', () => {
    const input = [
        { id: 'a', url: 'https://linux.do/t/topic/1', details: { content_html: '<p>x<img src="https://linux.do/uploads/a.png"></p>' } },
        { id: 'b', url: 'https://example.com/post/1', details: { content_html: '<p>ok<img src="https://example.com/x.png"></p>' } },
        { id: 'c', url: 'https://linux.do/t/topic/2', details: { content_html: '<p>y<video src="https://linux.do/v.mp4"></video></p>' } },
        { id: 'd', url: 'https://linux.do/t/topic/3', details: { content_html: '<p>z<img src="https://linux.do/uploads/b.png"></p>' } }
    ];

    const output = applyLinuxDoPolicy(input, { maxItems: 2, stripMedia: true });
    assert.equal(output.length, 3);
    assert.deepEqual(output.map((x) => x.id), ['a', 'b', 'c']);
    assert.equal(output[0].details.content_html.includes('<img'), false);
    assert.equal(output[2].details.content_html.includes('<video'), false);
    assert.equal(output[1].details.content_html.includes('<img'), true);
});

test('applyLinuxDoPolicy keeps linux.do media when stripMedia=false', () => {
    const input = [
        { id: 'a', url: 'https://linux.do/t/topic/1', details: { content_html: '<p>x<img src="https://linux.do/uploads/a.png"></p>' } },
        { id: 'b', url: 'https://linux.do/t/topic/2', details: { content_html: '<p>y</p>' } }
    ];

    const output = applyLinuxDoPolicy(input, { maxItems: 3, stripMedia: false });
    assert.equal(output.length, 2);
    assert.equal(output[0].details.content_html.includes('<img'), true);
});

