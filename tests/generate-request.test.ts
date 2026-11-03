import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type RequestListener} from 'node:http';
import {once} from 'node:events';
import {DisplayError,requestGeneration} from '../app/me/generate-request.ts';

async function withApi(handler:RequestListener,run:()=>Promise<void>){
  const server=createServer(handler);
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  assert.ok(address&&typeof address==='object');
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(input,init)=>originalFetch(new URL(String(input),`http://127.0.0.1:${address.port}`),init);
  try{await run();}
  finally{
    globalThis.fetch=originalFetch;
    server.closeAllConnections();
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

test('a stalled response times out and a subsequent request succeeds',async()=>{
  let requests=0;
  await withApi((_req,res)=>{
    if(++requests===1)return;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ready:true}));
  },async()=>{
    await assert.rejects(requestGeneration('합성 이야기',100),error=>
      error instanceof DisplayError&&error.message.includes('응답이 늦어지고'));
    assert.deepEqual(await requestGeneration('다시 시도한 합성 이야기',2_000),{ready:true});
  });
});

test('the timeout also covers a stalled JSON response body',async()=>{
  await withApi((_req,res)=>{
    res.setHeader('Content-Type','application/json');
    res.write('{"ready":');
  },async()=>{
    await assert.rejects(requestGeneration('합성 이야기',100),error=>
      error instanceof DisplayError&&error.message.includes('응답이 늦어지고'));
  });
});

test('API errors retain their recovery message',async()=>{
  await withApi((_req,res)=>{
    res.writeHead(503,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'검증된 추천 자료를 준비 중입니다.'}));
  },async()=>{
    await assert.rejects(requestGeneration('합성 이야기',2_000),error=>
      error instanceof DisplayError&&error.message==='검증된 추천 자료를 준비 중입니다.');
  });
});
