import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEventGate} from '../src/event-guard.ts';
import {AdmissionError} from '../src/generation-guard.ts';
import {createEventHandler} from '../src/event-handler.ts';
const limited=(error:unknown)=>error instanceof AdmissionError&&error.status===429;
test('event gate bounds clients, total attempts and concurrent bodies before DB work',()=>{
  let now=0;const gate=createEventGate({perMinute:1,globalPerMinute:2,maxInFlight:1},()=>now);
  const release=gate.enter('a');assert.throws(()=>gate.enter('b'),limited);release();release();
  assert.throws(()=>gate.enter('a'),limited);gate.enter('b')();assert.throws(()=>gate.enter('c'),limited);
  now=60000;gate.enter('a')();
});
test('production events require trusted proxy identity and enforce limits despite cookie resets',async()=>{
  const keys=['NODE_ENV','APP_ORIGIN','GENERATION_SECRET','TRUSTED_CLIENT_IP_HEADER','TRUSTED_PROXY_TOKEN'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));let writes=0;
  try{
    Object.assign(process.env,{NODE_ENV:'production',APP_ORIGIN:'https://example.com',GENERATION_SECRET:'x'.repeat(40),TRUSTED_CLIENT_IP_HEADER:'x-real-ip',TRUSTED_PROXY_TOKEN:'p'.repeat(40)});
    const handler=createEventHandler({gate:createEventGate({perMinute:2,globalPerMinute:10,maxInFlight:2}),write:async()=>{writes++;}});
    const request=(trusted=true,body:unknown={mode:'character',event:'visit'})=>new Request('https://example.com/api/events',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json','x-real-ip':'203.0.113.7',...(trusted?{'x-mto-proxy-token':'p'.repeat(40)}:{})},body:JSON.stringify(body)});
    assert.equal((await handler(request(false))).status,503);assert.equal(writes,0);
    assert.equal((await handler(request())).status,204);assert.equal((await handler(request())).status,204);
    const denied=await handler(request());assert.equal(denied.status,429);assert.equal(denied.headers.get('Retry-After'),'60');assert.equal(writes,2);
    const invalid=createEventHandler({write:async()=>{writes++;}});
    assert.equal((await invalid(request(true,{mode:'character',event:'visit',story:'private text'}))).status,400);assert.equal(writes,2);
  }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
test('event failures release concurrent capacity and return a bounded failure',async()=>{
  let writes=0;
  const handler=createEventHandler({gate:createEventGate({perMinute:10,globalPerMinute:10,maxInFlight:1}),write:async()=>{writes++;throw new Error('unavailable');}});
  const request=()=>new Request('http://localhost/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'me',event:'visit'})});
  assert.equal((await handler(request())).status,503);assert.equal((await handler(request())).status,503);assert.equal(writes,2);
});
