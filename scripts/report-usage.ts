import {db} from '../src/db.ts';
let pool:ReturnType<typeof db>|undefined;
try{
  pool=db();
  const events=await pool.query(`SELECT day_utc::text,mode,event,rank,count::text FROM analytics_daily
    WHERE day_utc>=(now() AT TIME ZONE 'UTC')::date-6 ORDER BY day_utc,mode,event,rank`);
  const budget=await pool.query(`SELECT day_utc::text,requests,attempts,reserved_microusd::text FROM generation_daily
    WHERE day_utc>=(now() AT TIME ZONE 'UTC')::date-6 ORDER BY day_utc`);
  console.log(JSON.stringify({note:'Event counts, not unique people or confirmed posts. Budget includes unknown-usage reservations.',events:events.rows,budget:budget.rows},null,2));
}catch{console.error('Usage report unavailable; check the database and migrations.');process.exitCode=1;}
finally{await pool?.end().catch(()=>{});}
