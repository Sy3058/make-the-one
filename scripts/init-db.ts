import {readFileSync} from 'node:fs';
import pg from 'pg';

let client:pg.Client|undefined;
try{
  client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:30_000});
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await client.connect();
  const version=await client.query<{version:string}>("SELECT current_setting('server_version_num') AS version");
  if(Number(version.rows[0].version)<160000||Number(version.rows[0].version)>=170000) throw new Error('PostgreSQL 16 is required');
  const tables=['policy','solar_term','place','chart','chart_occurrence','chart_motif','name_entry','build_manifest'];
  const found=await client.query<{name:string}>("SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1)",[tables]);
  if(found.rows.length===tables.length){console.log('Initial schema already present; no tables changed.');}
  else if(found.rows.length){throw new Error('Partial schema exists; refusing to modify it');}
  else{
    await client.query(readFileSync(new URL('../db/001_init.sql',import.meta.url),'utf8'));
    console.log('PostgreSQL 16 initial schema applied.');
  }
}catch{
  await client?.query('ROLLBACK').catch(()=>{});
  console.error('DB initialization failed; check connection, version and existing schema. Details suppressed.');
  process.exitCode=1;
}finally{await client?.end().catch(()=>{});}
