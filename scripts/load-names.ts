import pg from 'pg';
import {validateNameCorpus} from '../src/name-corpus.ts';

const corpus=validateNameCorpus();
let client:pg.Client|undefined;
const columns=['name_id','hangul','hanja','reading_verified','meaning_ko','motif_tags','style_tags','naturalness','is_playful','review_status','source_url','provenance_note','corpus_version'] as const;
try{
  client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:30_000});
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  await client.connect();await client.query('BEGIN');
  const existing=await client.query(`SELECT ${columns.join(',')} FROM name_entry WHERE name_id=ANY($1)`,[corpus.entries.map(n=>n.name_id)]);
  for(const row of existing.rows){
    const expected=corpus.entries.find(n=>n.name_id===row.name_id)!;
    if(columns.some(key=>JSON.stringify(row[key])!==JSON.stringify(expected[key])))
      throw new Error('Existing name data differs; refusing overwrite');
  }
  for(const entry of corpus.entries){
    await client.query(`INSERT INTO name_entry (${columns.join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT (name_id) DO NOTHING`,columns.map(key=>entry[key]));
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({corpusVersion:corpus.version,serious:corpus.entries.filter(n=>!n.is_playful).length,playful:corpus.entries.filter(n=>n.is_playful).length}));
}catch{
  await client?.query('ROLLBACK').catch(()=>{});
  console.error('Name load failed; check corpus validation, connection and existing records. Details suppressed.');process.exitCode=1;
}finally{await client?.end().catch(()=>{});}
