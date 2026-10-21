import assert from 'node:assert/strict';
import test from 'node:test';
import {callChatAPI, callChatAPIStream} from '../src/chatapi.js';

const env={USE_MODEL_PLATFORM:'ANTHROPIC',ANTHROPIC_API_BASE_URL:'https://primary.invalid',ANTHROPIC_API_KEY:'secret-primary-test',DEFAULT_ANTHROPIC_MODEL:'test-model',OPENAI_BASE_URL:'https://fallback.invalid',OPENAI_API_KEY:'secret-fallback-test',DEFAULT_OPEN_MODEL:'test-open',ANTHROPIC_RETRY_MAX:'0'};

test('explicitly disabled OpenAI fallback cannot receive non-stream or stream prompts',async t=>{
    const urls=[];
    t.mock.method(globalThis,'fetch',async url=>{urls.push(String(url));return new Response('{}',{status:401});});
    for(const run of [()=>callChatAPI({...env,OPENAI_FALLBACK_ENABLED:'false'},'private-data'),async()=>{for await(const chunk of callChatAPIStream({...env,OPENAI_FALLBACK_ENABLED:'false'},'private-data')) assert.fail(chunk);}]){
        await assert.rejects(run,error=>{
            assert.equal(error.status,401);
            assert.equal(error.modelRouteFailures[0].role,'primary');
            assert.equal(JSON.stringify(error.modelRouteFailures).includes(env.ANTHROPIC_API_KEY),false);
            return true;
        });
    }
    assert.equal(urls.length,2);
    assert.ok(urls.every(url=>url.startsWith('https://primary.invalid/')));
});

test('enabled and legacy unset OpenAI fallback retain compatible behavior',async t=>{
    const urls=[];
    t.mock.method(globalThis,'fetch',async url=>{
        urls.push(String(url));
        if(String(url).includes('primary.invalid'))return new Response('{}',{status:401});
        return Response.json({choices:[{message:{content:'OK'}}]});
    });
    for(const scoped of [env,{...env,OPENAI_FALLBACK_ENABLED:'true'}])assert.equal(await callChatAPI(scoped,'hello'),'OK');
    assert.equal(urls.filter(url=>url.includes('fallback.invalid')).length,2);
});

test('route diagnostics distinguish primary and backup without leaking provider bodies',async t=>{
    t.mock.method(globalThis,'fetch',async url=>new Response('sensitive-provider-body',{status:String(url).includes('primary.invalid')?401:403}));
    await assert.rejects(()=>callChatAPI({...env,OPENAI_FALLBACK_ENABLED:'false',ANTHROPIC_BACKUP_API_BASE_URL:'https://backup.invalid',ANTHROPIC_BACKUP_API_KEY:'secret-backup-test'},'hello'),error=>{
        assert.deepEqual(error.modelRouteFailures.map(({role,status})=>({role,status})),[{role:'primary',status:401},{role:'backup',status:403}]);
        assert.doesNotMatch(JSON.stringify(error.modelRouteFailures),/secret|sensitive/);
        return true;
    });
});
