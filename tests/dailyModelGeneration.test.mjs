import assert from 'node:assert/strict';
import test from 'node:test';
import {generateDailyMarkdownWithFallback} from '../src/dailyModelGeneration.js';

test('network interruption discards partial text and retries once with the same native instructions',async()=>{
    let calls=0;
    const output=await generateDailyMarkdownWithFallback({},'sources','rules','test',{
        stream:async function*(){yield 'incomplete';throw new Error('Network connection lost.');},
        nonStream:async(env,user,system)=>{calls++;assert.equal(env.ANTHROPIC_NATIVE_SYSTEM_PROMPT,true);assert.equal(user,'sources');assert.equal(system,'rules');return 'complete draft';},
    });
    assert.equal(output,'complete draft');
    assert.equal(calls,1);
});

test('authentication and input errors never trigger a paid transport retry',async()=>{
    await assert.rejects(()=>generateDailyMarkdownWithFallback({},'sources','rules','test',{
        stream:async function*(){throw new Error('Anthropic Chat API error (401)');},
        nonStream:()=>assert.fail('must not retry authentication error'),
    }),/401/);
});

test('a failed non-stream recovery is propagated without another loop',async()=>{
    let calls=0;
    await assert.rejects(()=>generateDailyMarkdownWithFallback({},'sources','rules','test',{
        stream:async function*(){throw new Error('Network connection lost.');},
        nonStream:async()=>{calls++;throw new Error('still unavailable');},
    }),/still unavailable/);
    assert.equal(calls,1);
});
