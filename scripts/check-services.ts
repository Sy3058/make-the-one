import pg from 'pg';
import {extractMotifs} from '../src/meta.ts';

const selected=process.argv.slice(2);
if(selected.some(x=>!['--meta','--db'].includes(x))) throw new Error('Use --meta and/or --db');
const report:Record<string,unknown>={};
if(!selected.length||selected.includes('--meta')){
  const started=Date.now();
  try{
    const motifs=await extractMotifs('가상의 인물은 낯선 마을로 떠나 오랫동안 책을 읽고 작은 작업실에서 도구를 만들며 새로운 일을 배웠다.');
    report.meta={status:'ok',motifCount:motifs.length,evidenceValidated:true,latencyMs:Date.now()-started};
  }catch{
    report.meta={status:'failed',reason:'Check model access, quota and structured output; response details suppressed'};
    process.exitCode=1;
  }
}
if(!selected.length||selected.includes('--db')){
  let client:pg.Client|undefined;
  try{
  client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000});
    if(!process.env.DATABASE_URL) throw new Error('missing configuration');
    await client.connect();
    const result=await client.query<{version:string}>("SELECT current_setting('server_version_num') AS version");
    const version=Number(result.rows[0].version);
    if(version<160000||version>=170000) throw new Error('PostgreSQL 16 required');
    report.database={status:'ok',version};
  }catch{
    report.database={status:'failed',reason:'Check DATABASE_URL and PostgreSQL 16; connection details suppressed'};
    process.exitCode=1;
  }finally{await client?.end().catch(()=>{});}
}
console.log(JSON.stringify(report,null,2));
