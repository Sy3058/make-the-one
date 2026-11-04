import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clientIdentity,usageCost,attemptReserve,guardConfig} from '../src/generation-guard.ts';
import {uiEventSchema} from '../src/analytics.ts';
import {generationInput,narrativeInput} from '../src/generation-input.ts';
test('signed anonymous identities are reusable and tampering does not impersonate a browser',()=>{
  const secret='x'.repeat(40),url='https://example.com/api/generate';
  const first=clientIdentity(new Request(url),secret);
  assert.ok(first.cookie);
  const cookie=first.cookie.split(';')[0];
  assert.equal(clientIdentity(new Request(url,{headers:{Cookie:cookie}}),secret).hash,first.hash);
  assert.notEqual(clientIdentity(new Request(url,{headers:{Cookie:cookie.slice(0,-1)+'z'}}),secret).hash,first.hash);
  assert.notEqual(clientIdentity(new Request(url,{headers:{Cookie:cookie}}),'y'.repeat(40)).hash,first.hash);
  assert.match(first.cookie,/HttpOnly; SameSite=Strict/);assert.match(first.cookie,/; Secure$/);
});
test('accounting uses only bounded provider token counts and retains uncertainty',()=>{
  assert.equal(usageCost({prompt_tokens:1000,completion_tokens:500}),3375);
  assert.ok(usageCost({prompt_tokens:1_048_576,completion_tokens:2048})!<attemptReserve);
  for(const usage of [undefined,{},null,{prompt_tokens:'100',completion_tokens:2},{prompt_tokens:1,completion_tokens:2049},{prompt_tokens:NaN,completion_tokens:2}])assert.equal(usageCost(usage),undefined);
});
test('client event data never accepts narratives or server generation outcomes',()=>{
  assert.equal(uiEventSchema.safeParse({mode:'me',event:'visit'}).success,true);
  assert.equal(uiEventSchema.safeParse({mode:'character',event:'name_preference',rank:2}).success,true);
  for(const data of [{mode:'me',event:'visit',story:'private'}, {mode:'me',event:'visit',rank:1},{mode:'me',event:'share_click'},
    {mode:'me',event:'generation_complete'},{mode:'character',event:'card_download',rank:4}])assert.equal(uiEventSchema.safeParse(data).success,false);
});
test('character setting is explicit narrative context and existing names are not model input',()=>{
  const input=generationInput.parse({mode:'character',story:'어린 시절부터 도구를 만들고 관찰하며 손으로 익힌 기술을 이웃에게 나누었다.',setting:'바닷가의 작은 공방 마을',existingName:'기존 이름',style:'고전적'});
  const text=narrativeInput(input);assert.ok(text.includes(input.setting!));assert.ok(text.includes(input.story));assert.ok(!text.includes('기존 이름'));
  assert.equal(narrativeInput({...input,mode:'me'}),input.story);
});

test('trusted proxy identities survive cookie resets and reject unauthenticated or invalid address headers',()=>{
  const secret='x'.repeat(40),proxy={ipHeader:'x-real-ip',proxyToken:'p'.repeat(40)};
  const req=(cookie='',ip='203.0.113.7',token=proxy.proxyToken)=>new Request('https://example.com/api/generate',{headers:{Cookie:cookie,'x-real-ip':ip,'x-mto-proxy-token':token}});
  const first=clientIdentity(req(),secret,proxy);
  assert.equal(clientIdentity(req('mto_client=changed'),secret,proxy).hash,first.hash);assert.equal(first.cookie,undefined);
  assert.notEqual(clientIdentity(req('','203.0.113.8'),secret,proxy).hash,first.hash);
  assert.throws(()=>clientIdentity(req('','203.0.113.7',''),secret,proxy));
  assert.throws(()=>clientIdentity(req('','spoofed-address'),secret,proxy));
  assert.equal(clientIdentity(req('','2001:db8::1'),secret,proxy).hash,clientIdentity(req('','2001:0db8:0:0:0:0:0:1'),secret,proxy).hash);
});

test('production requires independent secrets and trusted headers; blank development configuration has a local fallback',()=>{
  const keys=['NODE_ENV','GENERATION_SECRET','TRUSTED_CLIENT_IP_HEADER','TRUSTED_PROXY_TOKEN'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try{
    Object.assign(process.env,{NODE_ENV:'development'});process.env.GENERATION_SECRET='';delete process.env.TRUSTED_CLIENT_IP_HEADER;delete process.env.TRUSTED_PROXY_TOKEN;
    assert.ok(guardConfig().secret.length>=32);
    Object.assign(process.env,{NODE_ENV:'production'});assert.throws(()=>guardConfig());
    process.env.GENERATION_SECRET='x'.repeat(40);assert.throws(()=>guardConfig());
    process.env.TRUSTED_CLIENT_IP_HEADER='x-real-ip';process.env.TRUSTED_PROXY_TOKEN='p'.repeat(40);assert.equal(guardConfig().ipHeader,'x-real-ip');
    process.env.TRUSTED_PROXY_TOKEN=process.env.GENERATION_SECRET;assert.throws(()=>guardConfig());
  }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
