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

test('daily-only backup selection uses its own model and key without changing shared configuration',async()=>{
    const env={USE_MODEL_PLATFORM:'ANTHROPIC',DAILY_MODEL_ROUTE:'backup',ANTHROPIC_API_BASE_URL:'https://primary.invalid',ANTHROPIC_BACKUP_API_BASE_URL:'https://backup.invalid',ANTHROPIC_API_KEY:'primary-test',ANTHROPIC_BACKUP_API_KEY:'backup-test',DEFAULT_ANTHROPIC_MODEL:'primary-model',DEFAULT_ANTHROPIC_BACKUP_MODEL:'backup-model'};
    const output=await generateDailyMarkdownWithFallback(env,'sources','rules','test',{
        stream:async function*(scoped){
            assert.equal(scoped.DEFAULT_ANTHROPIC_MODEL,'backup-model');
            assert.equal(scoped.ANTHROPIC_API_BASE_URL,'https://backup.invalid/v1/messages');
            assert.equal(scoped.ANTHROPIC_API_KEY,'backup-test');
            assert.equal(scoped.ANTHROPIC_BACKUP_API_KEY,'');
            yield 'complete';
        },
    });
    assert.equal(output,'complete');
    assert.equal(env.DEFAULT_ANTHROPIC_MODEL,'primary-model');
    assert.equal(env.ANTHROPIC_API_KEY,'primary-test');
    await assert.rejects(()=>generateDailyMarkdownWithFallback({...env,ANTHROPIC_BACKUP_API_KEY:''},'sources','rules','test'),/not configured/);
});
