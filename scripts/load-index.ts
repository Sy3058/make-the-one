import {createReadStream,readFileSync} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import pg from 'pg';
import places from '../data/places.json' with {type:'json'};
import {validateSolarTerms} from '../src/calendar-validation.ts';
import {civilYearWindow} from '../src/index-window.ts';
const base=process.argv[2];
if(!base||!process.env.DATABASE_URL) throw new Error('Provide an index directory and DATABASE_URL');
const manifest=JSON.parse(readFileSync(`${base}/manifest.json`,'utf8'));
if(manifest.status!=='draft'||manifest.policy_id!=='kr-mean-solar-23-v1') throw new Error('Unrecognized index policy or manifest status');
const gate=validateSolarTerms();
const window=civilYearWindow(manifest.years?.[0],manifest.years?.[1]);
if(manifest.versions?.astronomy!=='2.1.19'||manifest.versions?.timezone!=='0.6.5'||manifest.versions?.tzdb!=='2026e'||manifest.versions?.ruleset!=='mt1-v1'||manifest.solar_term_validation?.version!==gate.version)
  throw new Error('Index version metadata is missing or differs');
if(!Array.isArray(manifest.places)||!manifest.places.length||manifest.places.some((id:string)=>!places.some(p=>p.id===id))) throw new Error('Invalid index places');
for(const kind of ['charts','occurrences','motifs','solar_terms']){
  const path=`${base}/${kind==='solar_terms'?'solar_terms.json':kind+'.jsonl.gz'}`;
  const hash=createHash('sha256');for await(const chunk of createReadStream(path)) hash.update(chunk);
  if(hash.digest('hex')!==manifest.files?.[kind]?.sha256) throw new Error(`Index checksum mismatch: ${kind}`);
}
const terms=JSON.parse(readFileSync(`${base}/solar_terms.json`,'utf8')) as {year:number;longitude:number;instant_utc:string}[];
let client:pg.Client|undefined;
const statements={
  charts:`INSERT INTO chart(chart_id,policy_id,year_pillar,month_pillar,day_pillar,hour_pillar,features)
    SELECT chart_id,policy_id,year,month,day,hour,features FROM jsonb_to_recordset($1::jsonb)
    AS x(chart_id text,policy_id text,year text,month text,day text,hour text,features jsonb) ON CONFLICT DO NOTHING`,
  occurrences:`INSERT INTO chart_occurrence(chart_id,place_id,instant_utc,civil_time,utc_offset_min,solar_time,boundary_distance_min,is_representative)
    SELECT chart_id,place_id,instant_utc,civil_time,utc_offset_min,solar_time,boundary_distance_min,is_representative
    FROM jsonb_to_recordset($1::jsonb) AS x(chart_id text,place_id text,instant_utc timestamptz,
    civil_time timestamp,utc_offset_min smallint,solar_time timestamp,boundary_distance_min numeric,is_representative boolean)
    ON CONFLICT DO NOTHING`,
  motifs:`INSERT INTO chart_motif(chart_id,rule_id,motif,priority,family,evidence,ruleset_version,source_url)
    SELECT chart_id,rule_id,motif,priority,family,evidence,ruleset_version,source_url
    FROM jsonb_to_recordset($1::jsonb) AS x(chart_id text,rule_id text,motif text,priority smallint,
    family text,evidence jsonb,ruleset_version text,source_url text) ON CONFLICT DO NOTHING`,
};
try{
  client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:30_000});
  await client.connect();await client.query('BEGIN');
  const server=await client.query<{v:string}>("SELECT current_setting('server_version_num') AS v");
  if(Number(server.rows[0].v)<160000||Number(server.rows[0].v)>=170000) throw new Error('PostgreSQL 16 required');
  await client.query(`INSERT INTO policy(policy_id,astronomy_version,timezone_version,rule_version,place_version,day_boundary,status)
    VALUES($1,'2.1.19','0.6.5/IANA-2026e','mt1-v1','geonames-2026-10-29','solar_23','draft') ON CONFLICT DO NOTHING`,[manifest.policy_id]);
  for(const place of places.filter(p=>manifest.places.includes(p.id))){
    await client.query(`INSERT INTO place(place_id,name_ko,longitude,latitude,source_url,source_version)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(place_id) DO NOTHING`,[place.id,place.name,place.longitude,place.latitude,place.source,place.sourceVersion]);
  }
  for(const t of terms) await client.query(`INSERT INTO solar_term(policy_id,term_year,longitude,instant_utc)
    VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[manifest.policy_id,t.year,t.longitude,t.instant_utc]);
  await client.query(`INSERT INTO build_manifest(build_id,policy_id,started_at,chart_count,occurrence_count,motif_count,checksum_sha256,status,notes)
    VALUES($1,$2,now(),$3,$4,$5,$6,'running','File and ingestion verification only; policy remains draft')
    ON CONFLICT(build_id) DO UPDATE SET status='running'`,[manifest.checksum_sha256,manifest.policy_id,manifest.chart_count,manifest.occurrence_count,manifest.motif_count,manifest.checksum_sha256]);
  const occurrenceHash=createHash('sha256');
  for(const kind of ['charts','occurrences','motifs'] as const){
    const reader=createInterface({input:createReadStream(`${base}/${kind}.jsonl.gz`).pipe(createGunzip()),crlfDelay:Infinity});
    let batch:unknown[]=[],count=0;
    for await(const line of reader){
      const row=JSON.parse(line);
      if(kind==='occurrences'){
        const time=Date.parse(row.instant_utc);
        if(!Number.isFinite(time)||time<window.start||time>=window.end||!manifest.places.includes(row.place_id)||
          row.boundary_distance_min<0||(row.is_representative&&row.boundary_distance_min<15)) throw new Error('Invalid occurrence or representative boundary');
        occurrenceHash.update([row.chart_id,row.place_id,row.instant_utc].join('|')+'\n');
      }
      batch.push(row);count++;
      if(batch.length===500){await client.query(statements[kind],[JSON.stringify(batch)]);batch=[];}
    }
    if(batch.length) await client.query(statements[kind],[JSON.stringify(batch)]);
    const expected=kind==='charts'?manifest.chart_count:kind==='occurrences'?manifest.occurrence_count:manifest.motif_count;
    if(count!==expected) throw new Error(`Index row count mismatch: ${kind}`);
    console.log(kind,count);
  }
  if(occurrenceHash.digest('hex')!==manifest.checksum_sha256) throw new Error('Occurrence content checksum mismatch');
  await client.query(`UPDATE build_manifest SET status='verified',completed_at=now() WHERE build_id=$1`,[manifest.checksum_sha256]);
  await client.query('COMMIT');
  console.log('Index files verified and loaded atomically; policy remains draft.');
}catch{
  await client?.query('ROLLBACK').catch(()=>{});
  console.error('Index load failed and was rolled back; connection and response details suppressed.');process.exitCode=1;
}finally{await client?.end().catch(()=>{});}
