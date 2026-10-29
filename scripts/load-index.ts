import {createReadStream,readFileSync} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {db} from '../src/db';
import places from '../data/places.json' with {type:'json'};
const base=process.argv[2];
if(!base||!process.env.DATABASE_URL) throw new Error('usage: DATABASE_URL=... node --import tsx scripts/load-index.ts data/generated/pilot');
const manifest=JSON.parse(readFileSync(`${base}/manifest.json`,'utf8'));
if(manifest.status!=='draft')throw new Error('unrecognized manifest status');
const p=db();
await p.query(`INSERT INTO policy(policy_id,astronomy_version,timezone_version,rule_version,place_version,day_boundary,status)
  VALUES($1,'2.1.19','0.6.5/IANA-2026e','mt1-v1','geonames-2026-10-29','solar_23','draft') ON CONFLICT DO NOTHING`,
  [manifest.policy_id]);
for(const place of places){
  await p.query(`INSERT INTO place(place_id,name_ko,longitude,latitude,source_url,source_version,verified_at)
    VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(place_id) DO NOTHING`,
    [place.id,place.name,place.longitude,place.latitude,place.source,place.sourceVersion]);
}
const terms=JSON.parse(readFileSync(`${base}/solar_terms.json`,'utf8')) as {year:number;longitude:number;instant_utc:string}[];
for(const t of terms)await p.query(`INSERT INTO solar_term(policy_id,term_year,longitude,instant_utc)
  VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[manifest.policy_id,t.year,t.longitude,t.instant_utc]);
await p.query(`INSERT INTO build_manifest(build_id,policy_id,started_at,chart_count,occurrence_count,motif_count,checksum_sha256,status)
  VALUES($1,$2,now(),$3,$4,$5,$6,'running') ON CONFLICT(build_id) DO UPDATE SET status='running'`,
  [manifest.checksum_sha256,manifest.policy_id,manifest.chart_count,manifest.occurrence_count,manifest.motif_count,manifest.checksum_sha256]);
const kinds=['charts','occurrences','motifs'] as const;
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
    family text,evidence jsonb,ruleset_version text,source_url text) ON CONFLICT DO NOTHING`
};
for(const kind of kinds){
  const reader=createInterface({input:createReadStream(`${base}/${kind}.jsonl.gz`).pipe(createGunzip()),crlfDelay:Infinity});
  let batch:unknown[]=[],count=0;
  for await(const line of reader) {
    batch.push(JSON.parse(line));
    if(batch.length===500){await p.query(statements[kind],[JSON.stringify(batch)]);count+=batch.length;batch=[];}
  }
  if(batch.length){await p.query(statements[kind],[JSON.stringify(batch)]);count+=batch.length;}
  const expected=kind==='charts'?manifest.chart_count:kind==='occurrences'?manifest.occurrence_count:manifest.motif_count;
  if(count!==expected)throw new Error(`${kind} count mismatch: ${count} vs ${expected}`);
  console.log(kind,count);
}
await p.query(`UPDATE build_manifest SET status='verified',completed_at=now() WHERE build_id=$1`,[manifest.checksum_sha256]);
await p.end();
