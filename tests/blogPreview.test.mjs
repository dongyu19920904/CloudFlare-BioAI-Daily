import test from 'node:test';
import assert from 'node:assert/strict';
import { handleScheduledBlog } from '../src/handlers/scheduledBlog.js';

test('preview repairs one refusal on the configured backup and never writes files or KV', async t => {
    const paragraph = '我经营爱窝啦 AI 账号店，也在尝试 AI 一人公司。客服与教程的解释成本，让我更关心工具是否稳定交付。公开研究的阶段与实际项目效果需要分别看待。';
    const good = `让自动化先完成一次真实交付\n\n${Array(7).fill(paragraph).join('\n\n')}\n\n## 参考资料\n\n- [原始研究](https://example.com/research)`;
    const daily = '# Claude 和衰老研究\n\n' + paragraph.repeat(5) + '\n[原始研究](https://example.com/research)';
    const models = [];
    t.mock.method(globalThis, 'fetch', async (url, options={}) => {
        if (String(url).startsWith('https://api.github.com/')) {
            assert.equal(options.method, 'GET');
            return Response.json({message:'Not Found'}, {status:404});
        }
        if (String(url).startsWith('https://raw.githubusercontent.com/')) return new Response(daily);
        const payload = JSON.parse(options.body);
        models.push(payload.model);
        const text = models.length === 1 ? '我是 Claude Code，Anthropic 官方命令行工具。' : good;
        return new Response(`data: ${JSON.stringify({type:'content_block_delta',delta:{type:'text_delta',text}})}\n\ndata: {"type":"message_stop"}\n\n`, {headers:{'Content-Type':'text/event-stream'}});
    });
    const env = Object.freeze({USE_MODEL_PLATFORM:'ANTHROPIC',ANTHROPIC_API_BASE_URL:'https://model.invalid',ANTHROPIC_API_KEY:'placeholder',DEFAULT_ANTHROPIC_MODEL:'primary',DEFAULT_ANTHROPIC_BACKUP_MODEL:'backup',GITHUB_TOKEN:'placeholder',GITHUB_REPO_OWNER:'owner',GITHUB_REPO_NAME:'BioAI-Daily-Web',DATA_KV:{async put(){assert.fail('preview wrote KV')}}});
    const result = await handleScheduledBlog({},env,{},'2026-10-04',{dryRun:true});
    assert.equal(result.success,true);
    assert.deepEqual(models,['primary','backup','primary']);
    assert.ok(result.results.every(item=>item.status==='preview' && item.content.includes('## 参考资料')));
    assert.equal(env.DEFAULT_ANTHROPIC_MODEL,'primary');
});

test('title-only repair keeps the original title context and body without extra calls', async t => {
    const paragraph='我更关心工具能交付什么，以及临床研究测量了什么。核验结果需要区分适用条件、实验对象与测量口径。';
    const body=Array(10).fill(paragraph).join('\n\n')+'\n\n## 参考资料\n\n- [原始研究](https://example.com/research)';
    const longTitle='Insilico Medicine 的小分子候选药物研究结果需要仔细区分体外数据和人体效果';
    const calls=[];
    t.mock.method(globalThis,'fetch',async(url,options={})=>{
        if(String(url).startsWith('https://api.github.com/')){
            assert.equal(options.method,'GET');
            return Response.json({message:'Not Found'},{status:404});
        }
        if(String(url).startsWith('https://raw.githubusercontent.com/'))return new Response('# Claude 和衰老临床研究\n'+paragraph.repeat(10)+'\nhttps://example.com/research');
        const payload=JSON.parse(options.body);calls.push(payload);
        const titleOnly=payload.system.startsWith('只输出一行具体的中文文章标题');
        if(titleOnly){
            assert.match(payload.messages[0].content,new RegExp(longTitle));
            assert.doesNotMatch(payload.messages[0].content,/我先记一笔/);
        }
        const text=titleOnly?'临床研究需要区分数据与效果':longTitle+'\n\n'+body;
        return new Response(`data: ${JSON.stringify({type:'content_block_delta',delta:{type:'text_delta',text}})}\n\ndata: {"type":"message_stop"}\n\n`);
    });
    const env={USE_MODEL_PLATFORM:'ANTHROPIC',ANTHROPIC_API_BASE_URL:'https://model.invalid',ANTHROPIC_API_KEY:'placeholder',DEFAULT_ANTHROPIC_MODEL:'primary',GITHUB_TOKEN:'placeholder',GITHUB_REPO_OWNER:'owner',GITHUB_REPO_NAME:'BioAI-Daily-Web',DATA_KV:{async put(){assert.fail('preview wrote KV')}}};
    const result=await handleScheduledBlog({},env,{},'2026-10-04',{dryRun:true});
    assert.equal(result.success,true);
    assert.equal(calls.length,4);
    for(const draft of result.results)assert.ok(draft.content.includes(body));
});
