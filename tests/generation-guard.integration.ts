import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {admitGeneration,AdmissionError,attemptReserve} from '../src/generation-guard.ts';
import {recordEvent,recordUiEvent} from '../src/analytics.ts';
import {createGenerateHandler} from '../src/generate-handler.ts';
if(!process.env.DATABASE_URL&&process.env.PGHOST&&process.env.PGPASSWORD){
  const url=new URL('postgres://localhost/make_the_one');url.hostname=process.env.PGHOST;url.port=process.env.PGPORT??'5432';
  url.username=process.env.PGUSER??'user';url.password=process.env.PGPASSWORD;process.env.DATABASE_URL=url.toString();
}
assert.ok(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const schema='guard_test_'+randomUUID().replaceAll('-','');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`,max:6,connectionTimeoutMillis:5000,statement_timeout:10000});
const config={ipHeader:undefined,proxyToken:undefined,secret:'x'.repeat(40),perWindow:3,concurrent:2,dailyRequests:100,dailyAttempts:200,dailyBudget:10_000_000};
const hash=(index:number)=>index.toString(16).padStart(64,'0');
before(async()=>{await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);await admin.query(`SET search_path TO ${schema}`);
  await admin.query(readFileSync(new URL('../db/003_usage_and_events.sql',import.meta.url),'utf8'));});
beforeEach(async()=>{await pool.query('TRUNCATE generation_attempts,generation_daily,generation_clients,generation_leases,analytics_daily,analytics_windows');});
after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const denied=(code:string)=>(error:unknown)=>error instanceof AdmissionError&&error.code===code;
test('concurrent admissions share the DB limit and releasing a lease frees capacity',async()=>{
  const results=await Promise.allSettled([1,2,3,4].map(n=>admitGeneration(hash(n),pool,config)));
  const accepted=results.filter((r):r is PromiseFulfilledResult<Awaited<ReturnType<typeof admitGeneration>>>=>r.status==='fulfilled');
  assert.equal(accepted.length,2);assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason instanceof AdmissionError));
  await accepted[0].value.release();const next=await admitGeneration(hash(5),pool,config);await next.release();await accepted[1].value.release();
});
test('browser windows, day requests and expiry are enforced across leases',async()=>{
  for(let n=0;n<3;n++){const lease=await admitGeneration(hash(1),pool,config);await lease.release();}
  await assert.rejects(admitGeneration(hash(1),pool,config),denied('CLIENT_RATE_LIMIT'));
  await pool.query("UPDATE generation_clients SET window_started=now()-interval '11 minutes'");
  const next=await admitGeneration(hash(1),pool,config);
  await pool.query("UPDATE generation_leases SET expires_at=now()-interval '1 second'");
  await assert.rejects(next.reserve(),denied('GENERATION_EXPIRED'));
  const last=await admitGeneration(hash(2),pool,{...config,dailyRequests:5});await last.release();
  await assert.rejects(admitGeneration(hash(3),pool,{...config,dailyRequests:5}),denied('DAILY_BUDGET_EXHAUSTED'));
});
test('attempt reservations are atomic, charged on unknown outcomes and settled only once',async()=>{
  const lease=await admitGeneration(hash(1),pool,{...config,dailyBudget:attemptReserve*2});
  const attempts=await Promise.allSettled([lease.reserve(),lease.reserve(),lease.reserve()]);
  const accepted=attempts.filter((r):r is PromiseFulfilledResult<Awaited<ReturnType<typeof lease.reserve>>>=>r.status==='fulfilled');
  assert.equal(accepted.length,2);
  assert.equal(Number((await pool.query('SELECT reserved_microusd FROM generation_daily')).rows[0].reserved_microusd),attemptReserve*2);
  await accepted[0].value(undefined);
  assert.equal(Number((await pool.query('SELECT reserved_microusd FROM generation_daily')).rows[0].reserved_microusd),attemptReserve*2);
  await Promise.all([accepted[1].value({prompt_tokens:1000,completion_tokens:500}),accepted[1].value({prompt_tokens:1000,completion_tokens:500})]);
  assert.equal(Number((await pool.query('SELECT reserved_microusd FROM generation_daily')).rows[0].reserved_microusd),attemptReserve+3375);
  await lease.release();
});
test('daily attempts remain bounded even when low-cost responses release most reservations',async()=>{
  const lease=await admitGeneration(hash(1),pool,{...config,dailyAttempts:2});
  for(let n=0;n<2;n++){const settle=await lease.reserve();await settle({prompt_tokens:100,completion_tokens:20});}
  await assert.rejects(lease.reserve(),denied('DAILY_BUDGET_EXHAUSTED'));await lease.release();
});
test('a denied real handler makes zero paid calls and a failed upstream releases its lease',async t=>{
  const existing=await admitGeneration(hash(1),pool,{...config,concurrent:1});
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('synthetic disconnect');});
  t.mock.method(console,'info',()=>{});t.mock.method(console,'error',()=>{});
  const handler=createGenerateHandler({admit:browser=>admitGeneration(browser,pool,{...config,concurrent:1}),event:async()=>{}});
  const make=()=>new Request('http://localhost/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'character',story:'어린 시절부터 도구를 만들고 관찰하며 익힌 기술을 이웃에게 나누었다.'})});
  assert.equal((await handler(make())).status,429);assert.equal(calls,0);await existing.release();
  const previous=process.env.MODEL_API_KEY;process.env.MODEL_API_KEY='synthetic-test-key';
  try{const response=await handler(make());assert.equal(response.status,503);assert.equal(calls,2);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM generation_leases')).rows[0].n,0);
    assert.equal((await pool.query('SELECT attempts FROM generation_daily')).rows[0].attempts,2);
  }finally{if(previous===undefined)delete process.env.MODEL_API_KEY;else process.env.MODEL_API_KEY=previous;}
});
test('analytics persist only fixed aggregate counters, with no narrative or browser identifier',async()=>{
  await recordEvent('character','name_preference',2,pool);await recordEvent('character','name_preference',2,pool);
  const rows=(await pool.query('SELECT * FROM analytics_daily')).rows;assert.equal(rows.length,1);assert.equal(Number(rows[0].count),2);
  assert.deepEqual(Object.keys(rows[0]).sort(),['count','day_utc','event','mode','rank']);
});

test('production proxy identity cannot bypass the DB window by discarding cookies',async t=>{
  const keys=['NODE_ENV','APP_ORIGIN','GENERATION_SECRET','TRUSTED_CLIENT_IP_HEADER','TRUSTED_PROXY_TOKEN','MODEL_API_KEY','META_ALLOW_12'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('synthetic upstream failure');});
  t.mock.method(console,'info',()=>{});t.mock.method(console,'error',()=>{});
  try{
    Object.assign(process.env,{NODE_ENV:'production',APP_ORIGIN:'https://example.com',GENERATION_SECRET:'x'.repeat(40),TRUSTED_CLIENT_IP_HEADER:'x-real-ip',TRUSTED_PROXY_TOKEN:'p'.repeat(40),MODEL_API_KEY:'synthetic-test-key',META_ALLOW_12:'0'});
    const handler=createGenerateHandler({admit:browser=>admitGeneration(browser,pool,{...config,perWindow:1}),event:async()=>{}});
    const make=(trusted=true)=>new Request('https://example.com/api/generate',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com','x-real-ip':'203.0.113.7',...(trusted?{'x-mto-proxy-token':'p'.repeat(40)}:{})},body:JSON.stringify({mode:'character',story:'도구를 세심하게 다듬고 제작 기술을 배우며 익힌 기술을 이웃에게 나누었다.'})});
    assert.equal((await handler(make(false))).status,503);assert.equal(calls,0);
    const first=await handler(make());assert.equal(first.status,503);assert.equal(calls,2);assert.equal(first.headers.get('set-cookie'),null);
    assert.equal((await handler(make())).status,429);assert.equal(calls,2);
  }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});


test('UI counters enforce shared client and global quotas and reset stale buckets',async()=>{
  for(let n=0;n<30;n++)await recordUiEvent(hash(1),{mode:'me',event:'visit'},pool);
  await assert.rejects(recordUiEvent(hash(1),{mode:'me',event:'visit'},pool),denied('EVENT_RATE_LIMIT'));
  assert.equal(Number((await pool.query('SELECT count FROM analytics_daily')).rows[0].count),30);
  await pool.query("UPDATE analytics_windows SET window_started=now()-interval '11 minutes'");
  await recordUiEvent(hash(1),{mode:'me',event:'visit'},pool);
  assert.equal((await pool.query("SELECT used FROM analytics_windows WHERE bucket_key='global'")).rows[0].used,1);
  await pool.query("UPDATE analytics_windows SET used=300 WHERE bucket_key='global'");
  await assert.rejects(recordUiEvent(hash(2),{mode:'me',event:'visit'},pool),denied('EVENT_RATE_LIMIT'));
  assert.equal(Number((await pool.query('SELECT count FROM analytics_daily')).rows[0].count),31);
});
test('event lock contention fails promptly without holding generation admission lock',async()=>{
  const client=await pool.connect();await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(173216,2)');
  try{
    await assert.rejects(recordUiEvent(hash(1),{mode:'me',event:'visit'},pool),denied('EVENT_RATE_LIMIT'));
    const lease=await admitGeneration(hash(1),pool,config);await lease.release();
  }finally{await client.query('ROLLBACK');client.release();}
});
test('a blocked event write times out while generation remains available',async()=>{
  const events=new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`,max:1,connectionTimeoutMillis:250,statement_timeout:100});
  const client=await pool.connect();await client.query('BEGIN');await client.query('LOCK TABLE analytics_windows IN ACCESS EXCLUSIVE MODE');
  try{
    const blocked=assert.rejects(recordUiEvent(hash(1),{mode:'me',event:'visit'},events),(error:unknown)=>(error as {code?:string}).code==='57014');
    const lease=await admitGeneration(hash(1),pool,config);await lease.release();await blocked;
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM analytics_daily')).rows[0].n,0);
  }finally{await client.query('ROLLBACK');client.release();await events.end();}
});
