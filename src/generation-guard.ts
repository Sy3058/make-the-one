import {createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import type {Pool,PoolClient} from 'pg';
import {db} from './db';
export class AdmissionError extends Error{
  constructor(readonly status:429|503,readonly code:string,readonly retryAfter=60){
    super(status===429?'지금은 요청이 많아요. 잠시 후 다시 시도해 주세요.':'생성을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
}
const devSecret=randomBytes(32).toString('hex');
export const attemptReserve=1_320_000;
// Published 2026-11-04: 1,048,576 input tokens * $1.25/M + 2,048 output * $4.25/M < $1.32.
// No hosted tools. Keep failed/unknown-usage reservations; settle only validated provider accounting.
export function usageCost(usage:unknown):number|undefined{
  if(!usage||typeof usage!=='object')return;
  const u=usage as {prompt_tokens?:unknown;completion_tokens?:unknown};
  if(typeof u.prompt_tokens!=='number'||!Number.isSafeInteger(u.prompt_tokens)||u.prompt_tokens<0||u.prompt_tokens>1_048_576||
    typeof u.completion_tokens!=='number'||!Number.isSafeInteger(u.completion_tokens)||u.completion_tokens<0||u.completion_tokens>2048)return;
  return Math.ceil((u.prompt_tokens*5+u.completion_tokens*17)/4);
}
function integer(value:string|undefined,fallback:number,max:number){
  if(value===undefined)return fallback;
  if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>max)throw new AdmissionError(503,'LIMIT_CONFIGURATION_INVALID');
  return Number(value);
}
export function guardConfig(){
  const secret=process.env.GENERATION_SECRET||(process.env.NODE_ENV==='production'?'':devSecret);
  if(secret.length<32)throw new AdmissionError(503,'LIMIT_CONFIGURATION_INVALID');
  const ipHeader=process.env.TRUSTED_CLIENT_IP_HEADER;
  const proxyToken=process.env.TRUSTED_PROXY_TOKEN;
  if(ipHeader&&!['cf-connecting-ip','x-real-ip','fly-client-ip'].includes(ipHeader))throw new AdmissionError(503,'LIMIT_CONFIGURATION_INVALID');
  if(process.env.NODE_ENV==='production'&&(!ipHeader||!proxyToken||proxyToken.length<32||proxyToken===secret))throw new AdmissionError(503,'LIMIT_CONFIGURATION_INVALID');
  return {secret,ipHeader,proxyToken,perWindow:integer(process.env.GENERATION_PER_10_MINUTES,3,100),
    concurrent:integer(process.env.GENERATION_CONCURRENCY,2,20),dailyAttempts:integer(process.env.GENERATION_DAILY_ATTEMPTS,200,10000),dailyRequests:integer(process.env.GENERATION_DAILY_REQUESTS,100,10000),
    dailyBudget:integer(process.env.GENERATION_DAILY_BUDGET_MICROUSD,10_000_000,1_000_000_000)};
}
export function clientIdentity(request:Request,secret:string,proxy?:{ipHeader?:string;proxyToken?:string}){
  const hmac=(value:string)=>createHmac('sha256',secret).update(value).digest('hex');
  if(proxy?.ipHeader){
    const expected=Buffer.from(proxy.proxyToken??''),received=Buffer.from(request.headers.get('x-mto-proxy-token')??'');
    if(expected.length<32||expected.length!==received.length||!timingSafeEqual(expected,received))throw new AdmissionError(503,'TRUSTED_PROXY_REQUIRED');
    const ip=request.headers.get(proxy.ipHeader)??'';
    const kind=isIP(ip);if(!kind)throw new AdmissionError(503,'TRUSTED_PROXY_REQUIRED');
    const canonical=kind===6?new URL(`http://[${ip}]/`).hostname:ip;
    return {hash:hmac('ip:'+new Date().toISOString().slice(0,10)+':'+canonical),cookie:undefined};
  }
  if(process.env.NODE_ENV==='production')throw new AdmissionError(503,'TRUSTED_PROXY_REQUIRED');
  const value=request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith('mto_client='))?.slice('mto_client='.length);
  const [candidate,signature]=value?.split('.')??[];
  const valid=candidate&&/^[a-f0-9-]{36}$/.test(candidate)&&signature&&/^[a-f0-9]{64}$/.test(signature)&&
    timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(hmac(candidate),'hex'));
  const id=valid?candidate:randomUUID();
  return {hash:hmac('client:'+id),cookie:`mto_client=${id}.${hmac(id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(request.url).protocol==='https:'?'; Secure':''}`};
}
async function transaction<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>){
  const client=await pool.connect();
  try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(173216,1)');
    const result=await work(client);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
export async function admitGeneration(hash:string,pool=db(),config=guardConfig()){
  const id=randomUUID();
  await transaction(pool,async client=>{
    await client.query("DELETE FROM generation_leases WHERE expires_at<=now()");
    await client.query("DELETE FROM generation_clients WHERE window_started<now()-interval '1 day'");
    await client.query("DELETE FROM generation_attempts WHERE day_utc<(now() AT TIME ZONE 'UTC')::date-14");
    await client.query("DELETE FROM generation_daily WHERE day_utc<(now() AT TIME ZONE 'UTC')::date-14");
    await client.query("DELETE FROM analytics_daily WHERE day_utc<(now() AT TIME ZONE 'UTC')::date-90");
    const global=await client.query<{attempts:number;requests:number;reserved_microusd:string}>(`SELECT attempts,requests,reserved_microusd FROM generation_daily WHERE day_utc=(now() AT TIME ZONE 'UTC')::date`);
    if((global.rows[0]?.requests??0)>=config.dailyRequests||(global.rows[0]?.attempts??0)>=config.dailyAttempts||Number(global.rows[0]?.reserved_microusd??0)+attemptReserve>config.dailyBudget)
      throw new AdmissionError(429,'DAILY_BUDGET_EXHAUSTED',3600);
    const active=await client.query<{count:number}>('SELECT count(*)::int AS count FROM generation_leases');
    if(active.rows[0].count>=config.concurrent)throw new AdmissionError(429,'GENERATION_BUSY',30);
    const browser=await client.query<{used:number;recent:boolean}>(`SELECT used,window_started>now()-interval '10 minutes' AS recent FROM generation_clients WHERE client_hash=$1`,[hash]);
    if(browser.rows[0]?.recent&&browser.rows[0].used>=config.perWindow)throw new AdmissionError(429,'CLIENT_RATE_LIMIT',600);
    await client.query(`INSERT INTO generation_clients(client_hash,window_started,used) VALUES($1,now(),1)
      ON CONFLICT(client_hash) DO UPDATE SET used=CASE WHEN generation_clients.window_started>now()-interval '10 minutes' THEN generation_clients.used+1 ELSE 1 END,
      window_started=CASE WHEN generation_clients.window_started>now()-interval '10 minutes' THEN generation_clients.window_started ELSE now() END`,[hash]);
    await client.query(`INSERT INTO generation_daily(day_utc,requests) VALUES((now() AT TIME ZONE 'UTC')::date,1)
      ON CONFLICT(day_utc) DO UPDATE SET requests=generation_daily.requests+1`);
    await client.query("INSERT INTO generation_leases(lease_id,expires_at) VALUES($1,now()+interval '120 seconds')",[id]);
  });
  return {id,async reserve(){
    const attemptId=randomUUID();
    await transaction(pool,async client=>{
      const lease=await client.query("UPDATE generation_leases SET expires_at=now()+interval '120 seconds' WHERE lease_id=$1 AND expires_at>now() RETURNING lease_id",[id]);
      if(!lease.rowCount)throw new AdmissionError(429,'GENERATION_EXPIRED');
      const daily=await client.query(`INSERT INTO generation_daily(day_utc,attempts,reserved_microusd) VALUES((now() AT TIME ZONE 'UTC')::date,1,$1)
        ON CONFLICT(day_utc) DO UPDATE SET attempts=generation_daily.attempts+1,reserved_microusd=generation_daily.reserved_microusd+$1
        WHERE generation_daily.attempts<$2 AND generation_daily.reserved_microusd+$1<=$3 RETURNING day_utc`,[attemptReserve,config.dailyAttempts,config.dailyBudget]);
      if(!daily.rowCount)throw new AdmissionError(429,'DAILY_BUDGET_EXHAUSTED',3600);
      await client.query('INSERT INTO generation_attempts(attempt_id,day_utc,charged_microusd) VALUES($1,$2,$3)',[attemptId,daily.rows[0].day_utc,attemptReserve]);
    });
    return async(usage:unknown)=>{
      const cost=usageCost(usage);if(cost===undefined)return;
      await transaction(pool,async client=>{
        const settled=await client.query<{day_utc:string;charged_microusd:string}>(`UPDATE generation_attempts SET settled=true,charged_microusd=$2
          WHERE attempt_id=$1 AND settled=false RETURNING day_utc`,[attemptId,cost]);
        if(settled.rowCount)await client.query('UPDATE generation_daily SET reserved_microusd=reserved_microusd-$2 WHERE day_utc=$1',[settled.rows[0].day_utc,attemptReserve-cost]);
      });
    };
  },async release(){await pool.query('DELETE FROM generation_leases WHERE lease_id=$1',[id]);}};
}
