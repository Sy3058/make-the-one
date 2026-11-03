import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync,mkdtempSync,rmSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import pg from 'pg';
import {candidates,db} from '../src/db.ts';

// CI supplies component variables, avoiding checked-in credential-bearing URLs.
if(!process.env.DATABASE_URL&&process.env.PGHOST&&process.env.PGPASSWORD){
  const url=new URL('postgres://localhost/make_the_one');
  url.hostname=process.env.PGHOST;url.port=process.env.PGPORT??'5432';
  url.username=process.env.PGUSER??'user';url.password=process.env.PGPASSWORD;
  process.env.DATABASE_URL=url.toString();
}
assert.ok(process.env.DATABASE_URL,'Provide a local development DB');
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname),'Integration tests require a local DB');
const source=resolve(process.env.INDEX_DIR??'data/generated/pilot-2024');
const manifest=JSON.parse(readFileSync(join(source,'manifest.json'),'utf8'));
const temporary=mkdtempSync(join(tmpdir(),'mto-index-check-'));
after(()=>rmSync(temporary,{recursive:true,force:true}));
after(()=>db().end());
const environment={PATH:process.env.PATH,DATABASE_URL:process.env.DATABASE_URL,NODE_ENV:'test' as const};
function run(script:string,args:string[]=[]){
  return spawnSync(process.execPath,['--import','tsx',script,...args],{encoding:'utf8',env:environment});
}
function successful(script:string,args:string[]=[]){
  const result=run(script,args);assert.equal(result.status,0,`${script}: ${result.stdout} ${result.stderr}`);
}
async function state(){
  const client=new pg.Client({connectionString:process.env.DATABASE_URL});
  try{
    await client.connect();
    const result=await client.query(`SELECT (SELECT count(*)::int FROM chart) AS charts,
      (SELECT count(*)::int FROM chart_occurrence) AS occurrences,
      (SELECT count(*)::int FROM chart_motif) AS motifs,
      (SELECT count(*)::int FROM name_entry) AS names,
      (SELECT status FROM build_manifest WHERE build_id=$1) AS build_status`,[manifest.checksum_sha256]);
    return result.rows[0];
  }finally{await client.end();}
}
successful('scripts/init-db.ts');
successful('scripts/load-index.ts',[source]);
successful('scripts/load-names.ts');

test('verified pilot and names are idempotent on actual PostgreSQL 16',async()=>{
  const before=await state();
  successful('scripts/load-index.ts',[source]);successful('scripts/load-names.ts');
  assert.deepEqual(await state(),before);
  assert.equal(before.build_status,'verified');assert.equal(before.names,84);
  assert.equal(before.charts,manifest.chart_count);assert.equal(before.occurrences,manifest.occurrence_count);
});
test('candidate civil timestamps and stored offsets survive JSON without timezone conversion',async()=>{
  const client=new pg.Client({connectionString:process.env.DATABASE_URL});
  try{
    await client.connect();
    const motif=await client.query<{motif:string}>(`SELECT motif FROM chart_motif
      WHERE priority>=2 AND family<>'신살·운성' ORDER BY motif LIMIT 1`);
    assert.ok(motif.rows.length);
    const rows=await candidates([{tag:motif.rows[0].motif,importance:3,quote:'합성 이야기',negative:false,transition:false}]);
    assert.ok(rows.length);
    const row=rows[0];
    const expected=await client.query<{civil_time:string;utc_offset_min:number}>(`SELECT civil_time::text AS civil_time,utc_offset_min
      FROM chart_occurrence WHERE chart_id=$1 AND place_id=$2 AND instant_utc=$3`,
      [row.id,row.occurrence.place_id,row.occurrence.instant_utc]);
    assert.equal(typeof row.occurrence.civil_time,'string');
    const payload=JSON.parse(JSON.stringify({civilTime:row.occurrence.civil_time,utcOffsetMinutes:row.occurrence.utc_offset_min}));
    assert.equal(payload.civilTime,expected.rows[0].civil_time);
    assert.equal(typeof payload.utcOffsetMinutes,'number');
    assert.equal(payload.utcOffsetMinutes,expected.rows[0].utc_offset_min);
    assert.match(payload.civilTime,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:/);
  }finally{await client.end();}
});
test('a changed artifact fails checksum verification before changing the DB',async()=>{
  const target=join(temporary,'corrupt');cpSync(source,target,{recursive:true});
  appendFileSync(join(target,'charts.jsonl.gz'),'corrupt');
  const before=await state(),result=run('scripts/load-index.ts',[target]);
  assert.notEqual(result.status,0);assert.match(result.stderr,/checksum mismatch/);
  assert.deepEqual(await state(),before);
});
test('a late count failure rolls back build state and all writes',async()=>{
  const target=join(temporary,'wrong-count');cpSync(source,target,{recursive:true});
  writeFileSync(join(target,'manifest.json'),JSON.stringify({...manifest,motif_count:manifest.motif_count+1}));
  const before=await state(),result=run('scripts/load-index.ts',[target]);
  assert.notEqual(result.status,0);assert.match(result.stderr,/rolled back/);
  assert.deepEqual(await state(),before);
});
