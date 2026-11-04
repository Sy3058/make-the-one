import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readJson,InputError} from '../src/http-input.ts';
const request=(body:BodyInit,headers:Record<string,string>={})=>new Request('https://example.com/api/generate',{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
const status=(code:number)=>(error:unknown)=>error instanceof InputError&&error.status===code;
test('only bounded JSON from the same origin is accepted',async()=>{
  assert.deepEqual(await readJson(request('{"name":"하늘"}')),{name:'하늘'});
  await assert.rejects(readJson(request('{}',{Origin:'https://attacker.example'})),status(403));
  await assert.rejects(readJson(request('{}',{'Content-Type':'text/plain'})),status(415));
  await assert.rejects(readJson(request('{}',{'Content-Type':'application/jsonp'})),status(415));
  await assert.rejects(readJson(request('invalid')),status(400));
  await assert.rejects(readJson(request('{}',{'Content-Length':'99999'})),status(413));
  await assert.rejects(readJson(request(JSON.stringify('가'.repeat(20))),20),status(413));
});
test('a stalled streaming body times out and cancels its reader',async()=>{
  let canceled=false;
  const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){canceled=true;}});
  const req=new Request('https://example.com/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body,duplex:'half'} as RequestInit);
  await assert.rejects(readJson(req,1024,20),status(408));assert.equal(canceled,true);
});

test('development Host aliases are compared with the browser origin, not an internal Next URL',async()=>{
  const req=new Request('http://localhost:3000/api/generate',{method:'POST',headers:{'Content-Type':'application/json',Host:'127.0.0.1:3000',Origin:'http://127.0.0.1:3000'},body:'{}'});
  assert.deepEqual(await readJson(req),{});
  await assert.rejects(readJson(request('{}',{Host:'example.com',Origin:'https://attacker.example','X-Forwarded-Host':'attacker.example'})),status(403));
});

test('production uses a configured HTTPS origin and ignores spoofed Host aliases',async()=>{
  const previousMode=process.env.NODE_ENV,previousOrigin=process.env.APP_ORIGIN;
  try{
    Object.assign(process.env,{NODE_ENV:'production'});delete process.env.APP_ORIGIN;
    await assert.rejects(readJson(request('{}')),status(503));
    process.env.APP_ORIGIN='https://example.com';
    assert.deepEqual(await readJson(request('{}',{Origin:'https://example.com',Host:'internal:3000'})),{});
    await assert.rejects(readJson(request('{}',{Origin:'https://attacker.example',Host:'attacker.example'})),status(403));
    process.env.APP_ORIGIN='http://example.com';await assert.rejects(readJson(request('{}')),status(503));
  }finally{if(previousMode===undefined)Reflect.deleteProperty(process.env,'NODE_ENV');else Reflect.set(process.env,'NODE_ENV',previousMode);
    if(previousOrigin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previousOrigin;}
});
