import {beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {extractMotifs,MetaServiceError} from '../src/meta.ts';
import {POST} from '../app/api/generate/route.ts';

beforeEach(t=>{if('mock' in t)t.mock.method(console,'info',()=>{});});

const story='가상의 인물은 책을 읽으며 배움을 이어가고 아픈 이웃을 돌보며 따뜻한 관계를 맺었다.';
const motifs=[
  {tag:'배움',importance:3,quote:'책을 읽으며',negative:false,transition:false},
  {tag:'돌봄',importance:2,quote:'이웃을 돌보며',negative:false,transition:false},
];
const validResponse=()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({motifs})}}]}));

async function withMeta(fetcher:typeof fetch,run:()=>Promise<void>,fallback=false){
  const previousKey=process.env.MODEL_API_KEY;
  const previousFallback=process.env.META_ALLOW_12;
  const originalFetch=globalThis.fetch;
  process.env.MODEL_API_KEY='synthetic-test-key';
  process.env.META_ALLOW_12=fallback?'1':'0';
  globalThis.fetch=fetcher;
  try{await run();}
  finally{
    globalThis.fetch=originalFetch;
    if(previousKey===undefined)delete process.env.MODEL_API_KEY;else process.env.MODEL_API_KEY=previousKey;
    if(previousFallback===undefined)delete process.env.META_ALLOW_12;else process.env.META_ALLOW_12=previousFallback;
  }
}
const stalledFetch:typeof fetch=async(_input,init)=>new Promise<Response>((_resolve,reject)=>{
  init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
});
const disconnectedResponse=()=>new Response(new ReadableStream({start(controller){
  controller.error(new TypeError('terminated: synthetic provider connection reset'));
}}));

test('motif extraction requests minimal reasoning with a bounded completion budget',async()=>{
  await withMeta(async(_input,init)=>{
    const body=JSON.parse(String(init?.body));
    assert.equal(body.reasoning_effort,'minimal');
    assert.equal(body.max_completion_tokens,2048);
    assert.equal(body.response_format.type,'json_schema');
    return validResponse();
  },async()=>{
    assert.deepEqual(await extractMotifs(story),motifs);
  });
});

test('attempt timing logs retain only safe numeric usage and omit content and credentials',async t=>{
  const logs:unknown[][]=[];
  t.mock.method(console,'info',(...args:unknown[])=>logs.push(args));
  for(const reasoningTokens of [221,'synthetic-private-provider-text']){
    await withMeta(async()=>new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify({motifs})}}],
      usage:{completion_tokens:420,completion_tokens_details:{reasoning_tokens:reasoningTokens},extra:story},
    })),async()=>{await extractMotifs(story);});
  }
  const metrics=logs.map(entry=>entry[1] as Record<string,unknown>);
  assert.equal(metrics[0].completionTokens,420);
  assert.equal(metrics[0].reasoningTokens,221);
  assert.equal(metrics[1].reasoningTokens,undefined);
  assert.ok(metrics.every(entry=>typeof entry.elapsedMs==='number'&&entry.elapsedMs>=0));
  const output=JSON.stringify(logs);
  for(const secret of [story,'synthetic-private-provider-text','synthetic-test-key'])assert.equal(output.includes(secret),false);
});

test('response-body connection failures are service errors with safe API diagnostics',async t=>{
  const logs:unknown[][]=[];
  t.mock.method(console,'error',(...args:unknown[])=>logs.push(args));
  let calls=0;
  await withMeta(async()=>{calls++;return disconnectedResponse();},async()=>{
    const response=await POST(new Request('http://localhost/api/generate',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'me',story}),
    }));
    assert.equal(calls,2);
    assert.equal(response.status,503);
    const body=await response.json();
    assert.equal(body.code,'MODEL_UNAVAILABLE');
    assert.match(body.error,/서비스에 연결하지 못했어요/);
    assert.equal(JSON.stringify(logs).includes(story),false);
    assert.equal(JSON.stringify(logs).includes('synthetic provider connection reset'),false);
    assert.match(JSON.stringify(logs),/"code":"MODEL_UNAVAILABLE"/);
  });
});

test('a response-body connection failure can recover on the single retry',async()=>{
  let calls=0;
  await withMeta(async()=>++calls===1?disconnectedResponse():validResponse(),async()=>{
    assert.deepEqual(await extractMotifs(story),motifs);
    assert.equal(calls,2);
  });
});

test('model timeouts retry once and expose a safe timeout code',async()=>{
  let calls=0;
  await withMeta(async(input,init)=>{calls++;return stalledFetch(input,init);},async()=>{
    await assert.rejects(extractMotifs(story,{attemptTimeoutMs:20,totalTimeoutMs:200}),error=>
      error instanceof MetaServiceError&&error.code==='MODEL_TIMEOUT');
    assert.equal(calls,2);
  });
});

test('a timed-out first attempt can recover on the single retry',async()=>{
  let calls=0;
  await withMeta(async(input,init)=>++calls===1?stalledFetch(input,init):validResponse(),async()=>{
    assert.deepEqual(await extractMotifs(story,{attemptTimeoutMs:20,totalTimeoutMs:200}),motifs);
    assert.equal(calls,2);
  });
});

test('the model timeout covers a stalled response body',async()=>{
  let calls=0;
  await withMeta(async(_input,init)=>{
    calls++;
    return new Response(new ReadableStream({start(controller){
      init?.signal?.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});
    }}));
  },async()=>{
    await assert.rejects(extractMotifs(story,{attemptTimeoutMs:20,totalTimeoutMs:200}),error=>
      error instanceof MetaServiceError&&error.code==='MODEL_TIMEOUT');
    assert.equal(calls,2);
  });
});

test('fallback attempts share the total deadline rather than extending it',async()=>{
  let calls=0;
  await withMeta(async(input,init)=>{calls++;return stalledFetch(input,init);},async()=>{
    await assert.rejects(extractMotifs(story,{attemptTimeoutMs:200,totalTimeoutMs:30}),error=>
      error instanceof MetaServiceError&&error.code==='MODEL_TIMEOUT');
    assert.ok(calls<=2);
  },true);
});

test('invalid provider JSON is classified without returning its contents',async()=>{
  await withMeta(async()=>new Response('synthetic invalid provider text'),async()=>{
    await assert.rejects(extractMotifs(story),error=>error instanceof MetaServiceError&&
      error.code==='MODEL_RESPONSE_INVALID'&&!error.message.includes('synthetic invalid provider text'));
  });
});

test('unsupported source quotes remain rejected after timeout changes',async()=>{
  const unsupported={motifs:motifs.map(m=>({...m,quote:'없는 합성 구절'}))};
  await withMeta(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(unsupported)}}]})),async()=>{
    await assert.rejects(extractMotifs(story),error=>error instanceof MetaServiceError&&error.code==='MODEL_RESPONSE_INVALID');
  });
});

test('API reports the model stage safely and distinguishes invalid model output',async t=>{
  const logs:unknown[][]=[];
  t.mock.method(console,'error',(...args:unknown[])=>logs.push(args));
  t.mock.method(console,'info',(...args:unknown[])=>logs.push(args));
  await withMeta(async()=>new Response('synthetic invalid provider text'),async()=>{
    const response=await POST(new Request('http://localhost/api/generate',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'me',story}),
    }));
    assert.equal(response.status,502);
    const body=await response.json();
    assert.equal(body.code,'MODEL_RESPONSE_INVALID');
    assert.match(body.error,/단서를 정리하지 못했어요/);
    assert.equal(JSON.stringify(logs).includes(story),false);
    assert.equal(JSON.stringify(logs).includes('synthetic invalid provider text'),false);
    assert.match(JSON.stringify(logs),/"stage":"model"/);
    const timing=logs.find(entry=>entry[0]==='generation timing')?.[1] as Record<string,unknown>;
    assert.ok(timing);
    for(const name of ['inputMs','modelMs','databaseMs','rankingMs','totalMs']){
      assert.equal(typeof timing[name],'number');
      assert.ok(Number.isFinite(timing[name])&&Number(timing[name])>=0);
    }
    assert.equal(timing.databaseMs,0);
    assert.equal(timing.rankingMs,0);
  });
});
