import {z} from 'zod';
import pg from 'pg';
import {AdmissionError} from './generation-guard';
import {eventLimits} from './event-guard';
const {Pool}=pg;
let eventPool:pg.Pool|undefined;
export function analyticsDb(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL unavailable');
  return eventPool??=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:250,statement_timeout:500});
}
export const uiEventSchema=z.object({mode:z.enum(['me','character']),event:z.enum(['visit','card_download','share_click','text_copy','name_preference']),rank:z.number().int().min(1).max(3).optional()}).strict()
  .refine(data=>data.event==='visit'?data.rank===undefined:data.rank!==undefined);
export type EventName=z.infer<typeof uiEventSchema>['event']|'generation_start'|'generation_complete'|'generation_error';
export async function recordEvent(mode:'me'|'character',event:EventName,rank=0,pool=analyticsDb()){
  await pool.query(`INSERT INTO analytics_daily(day_utc,mode,event,rank,count) VALUES((now() AT TIME ZONE 'UTC')::date,$1,$2,$3,1)
    ON CONFLICT(day_utc,mode,event,rank) DO UPDATE SET count=analytics_daily.count+1`,[mode,event,rank]);
}
export async function safeRecordEvent(mode:'me'|'character',event:EventName){
  try{await recordEvent(mode,event);}catch{console.error('analytics failed',{code:'EVENT_UNAVAILABLE'});}
}

export async function recordUiEvent(hash:string,data:z.infer<typeof uiEventSchema>,pool=analyticsDb()){
  const result=await pool.query<{written:boolean}>(`
    WITH gate AS (SELECT pg_try_advisory_xact_lock(173216,2) AS allowed),
    cleanup AS (DELETE FROM analytics_windows USING gate WHERE gate.allowed AND bucket_key NOT IN ('global',$2) AND window_started<now()-interval '10 minutes'),
    retention AS (DELETE FROM analytics_daily USING gate WHERE gate.allowed AND day_utc<(now() AT TIME ZONE 'UTC')::date-90),
    global_budget AS (
      INSERT INTO analytics_windows(bucket_key,window_started,used)
      SELECT 'global',date_trunc('minute',now()),1 FROM gate WHERE allowed
      ON CONFLICT(bucket_key) DO UPDATE SET
        used=CASE WHEN analytics_windows.window_started=date_trunc('minute',now()) THEN analytics_windows.used+1 ELSE 1 END,
        window_started=date_trunc('minute',now())
      WHERE analytics_windows.window_started<date_trunc('minute',now()) OR analytics_windows.used<$1
      RETURNING bucket_key
    ), client_budget AS (
      INSERT INTO analytics_windows(bucket_key,window_started,used)
      SELECT $2,date_trunc('minute',now()),1 FROM global_budget
      ON CONFLICT(bucket_key) DO UPDATE SET
        used=CASE WHEN analytics_windows.window_started=date_trunc('minute',now()) THEN analytics_windows.used+1 ELSE 1 END,
        window_started=date_trunc('minute',now())
      WHERE analytics_windows.window_started<date_trunc('minute',now()) OR analytics_windows.used<$3
      RETURNING bucket_key
    ), written AS (
      INSERT INTO analytics_daily(day_utc,mode,event,rank,count)
      SELECT (now() AT TIME ZONE 'UTC')::date,$4,$5,$6,1 FROM client_budget
      ON CONFLICT(day_utc,mode,event,rank) DO UPDATE SET count=analytics_daily.count+1
      RETURNING count
    ) SELECT EXISTS(SELECT 1 FROM written) AS written`,
    [eventLimits.globalPerMinute,'client:'+hash,eventLimits.perMinute,data.mode,data.event,data.rank??0]);
  if(!result.rows[0]?.written)throw new AdmissionError(429,'EVENT_RATE_LIMIT',60);
}
