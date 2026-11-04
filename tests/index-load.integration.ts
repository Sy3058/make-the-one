import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync,mkdtempSync,rmSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import pg from 'pg';
import {createGenerateHandler} from '../src/generate-handler.ts';
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
  assert.equal(before.build_status,'verified');assert.equal(before.names,96);
  assert.ok(before.charts>=manifest.chart_count);assert.ok(before.occurrences>=manifest.occurrence_count);
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

test('civil year ranges constrain both candidate admission and the selected representative occurrence',async()=>{
  const client=new pg.Client({connectionString:process.env.DATABASE_URL});
  try{
    await client.connect();
    for(const range of [{from:1980,to:1989},{from:1990,to:1999},{from:1985,to:1995},{from:2024,to:2024},{from:2039,to:2039}]){
      const bounds=[`${range.from}-01-01`,`${range.to+1}-01-01`];
      const available=await client.query<{motif:string}>(`SELECT m.motif FROM chart_occurrence o JOIN chart_motif m USING(chart_id)
        WHERE o.is_representative AND o.civil_time >= $1::timestamp AND o.civil_time < $2::timestamp
          AND m.priority>=2 AND m.family<>'신살·운성' LIMIT 1`,bounds);
      const tag=available.rows[0]?.motif??'기반';
      const rows=await candidates([{tag,importance:3,quote:'합성 근거',negative:false,transition:false}],range);
      assert.equal(rows.length>0,available.rows.length>0);
      for(const row of rows){
        const year=Number(row.occurrence.civil_time.slice(0,4));assert.ok(year>=range.from&&year<=range.to);
        assert.ok(row.evidence.some(e=>e.motif===tag&&e.priority>=2&&e.family!=='신살·운성'));
      }
    }
  }finally{await client.end();}
});
test('the structural anchor is applied before the database candidate cap',async()=>{
  const motif=(tag:string,importance:1|2|3)=>({tag,importance,quote:'합성 근거',negative:false,transition:false});
  const rows=await candidates([motif('관찰',3),motif('제작',2)],{from:2024,to:2024});
  assert.ok(rows.length>0);
  assert.ok(rows.every(row=>row.evidence.some(e=>e.motif==='관찰'&&e.priority>=2&&e.family!=='신살·운성')));
  assert.deepEqual(await candidates([motif('재시작',3),motif('제작',2)]),[]);
});


test('existing-name exclusion treats composed and decomposed Hangul identically in real recommendations',async t=>{
  const previous=process.env.MODEL_API_KEY;process.env.MODEL_API_KEY='synthetic-test-key';
  const motifs=[{tag:'배움',importance:3,quote:'책을 읽으며',negative:false,transition:false},{tag:'돌봄',importance:2,quote:'이웃을 돌보며',negative:false,transition:false}];
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({motifs})}}]})));
  t.mock.method(console,'info',()=>{});
  const handler=createGenerateHandler({admit:async()=>({id:'00000000-0000-0000-0000-000000000001',reserve:async()=>async()=>{},release:async()=>{}}),event:async()=>{}});
  const run=async(existingName?:string)=>{
    const response=await handler(new Request('http://localhost/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'character',story:'가상의 인물은 책을 읽으며 배움을 이어가고 아픈 이웃을 돌보며 따뜻한 관계를 맺었다.',yearRange:{from:2024,to:2024},existingName})}));
    assert.equal(response.status,200);const data=await response.json();
    assert.equal(data.versions.ranking,'three-pairs-elements-v1');assert.equal(data.versions.names,'ko-names-v3');
    for(const item of data.recommendations){assert.equal(Object.values(item.elementBalance.counts).reduce((sum:number,n)=>sum+Number(n),0),8);assert.ok(item.elementBalance.targets.length>0);}
    return data.recommendations as {name:{name:string}}[];
  };
  try{
    const name=(await run())[0].name.name;
    for(const existing of [name,name.normalize('NFD')])assert.ok((await run(existing)).every(item=>item.name.name.normalize('NFC')!==name));
  }finally{if(previous===undefined)delete process.env.MODEL_API_KEY;else process.env.MODEL_API_KEY=previous;}
});


test('v2 names upgrade without changing reviewed facts, and mismatches roll back in an isolated schema',async()=>{
  const schema='name_upgrade_'+Date.now().toString(36);
  const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
  const columns=['name_id','hangul','hanja','reading_verified','meaning_ko','motif_tags','style_tags','naturalness','is_playful','review_status','source_url','provenance_note'];
  try{
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`CREATE TABLE ${schema}.name_entry (LIKE public.name_entry INCLUDING ALL)`);
    await client.query(`INSERT INTO ${schema}.name_entry SELECT * FROM public.name_entry WHERE name_id NOT IN (SELECT 'ko-serious-'||lpad(n::text,3,'0') FROM generate_series(73,82) n)`);
    await client.query(`UPDATE ${schema}.name_entry SET corpus_version='ko-names-v2'`);
    const before=(await client.query(`SELECT ${columns.join(',')} FROM ${schema}.name_entry ORDER BY name_id`)).rows;
    assert.equal(before.length,86);
    const isolated=new URL(process.env.DATABASE_URL!);isolated.searchParams.set('options',`-c search_path=${schema}`);
    const load=()=>spawnSync(process.execPath,['--import','tsx','scripts/load-names.ts'],{encoding:'utf8',env:{...environment,DATABASE_URL:isolated.href}});
    assert.equal(load().status,0);
    const after=(await client.query(`SELECT ${columns.join(',')} FROM ${schema}.name_entry WHERE name_id=ANY($1) ORDER BY name_id`,[before.map(n=>n.name_id)])).rows;
    assert.deepEqual(after,before);
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM ${schema}.name_entry WHERE corpus_version='ko-names-v3'`)).rows[0].n,96);
    await client.query(`UPDATE ${schema}.name_entry SET meaning_ko='synthetic mismatch' WHERE name_id='ko-serious-001'`);
    const corrupted=(await client.query(`SELECT * FROM ${schema}.name_entry ORDER BY name_id`)).rows;
    assert.equal(load().status,1);assert.deepEqual((await client.query(`SELECT * FROM ${schema}.name_entry ORDER BY name_id`)).rows,corrupted);
  }finally{await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await client.end();}
});
