import {createHash} from 'node:crypto';
import {z} from 'zod';
const url=z.url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;});
const row=z.object({name:z.string().trim().transform(value=>value.normalize('NFC')).pipe(z.string().regex(/^[가-힣]{2,5}$/)),
  rank:z.number().int().min(1).max(100_000),count:z.number().int().min(1).max(100_000_000)}).strict();
const schema=z.object({version:z.literal('court-name-statistics-v1'),
  source:z.object({url,publisher:z.enum(['official','secondary']),upstream_url:url,snapshot_sha256:z.string().regex(/^[a-f0-9]{64}$/),snapshot_format:z.enum(['raw','normalized-facts']).default('raw'),captured_at:z.iso.date()}).strict(),
  scope:z.object({from:z.iso.date(),to:z.iso.date(),as_of:z.iso.date(),region:z.string().trim().min(1).max(80),sex:z.enum(['male','female','combined']),coverage:z.enum(['top-n','full']),limit:z.number().int().min(1).max(20_000).nullable()}).strict(),
  rows:z.array(row).min(1).max(20_000)}).strict();
export function validateNameStatistics(value:unknown,snapshot:Uint8Array,{allowSecondary=false}={}){
  const batch=schema.parse(value),{source,scope,rows}=batch;
  const court=(value:string)=>{const host=new URL(value).hostname;return host==='scourt.go.kr'||host.endsWith('.scourt.go.kr');};
  if(!court(source.upstream_url)||(source.publisher==='official'&&!court(source.url)))throw new Error('Court source required');
  if(source.publisher==='secondary'&&!allowSecondary)throw new Error('Secondary statistics require explicit opt-in');
  if(createHash('sha256').update(snapshot).digest('hex')!==source.snapshot_sha256)throw new Error('Statistics snapshot checksum differs');
  if(scope.from>scope.to||scope.to>scope.as_of||scope.as_of>source.captured_at)throw new Error('Statistics period differs');
  if(scope.coverage==='top-n'?(scope.limit===null||rows.length>scope.limit||rows.some(row=>row.rank>scope.limit!)):scope.limit!==null)throw new Error('Statistics coverage differs');
  if(new Set(rows.map(row=>row.name)).size!==rows.length)throw new Error('Duplicate statistics name');
  const sorted=[...rows].sort((a,b)=>a.rank-b.rank);
  if(sorted.some((r,i)=>i>0&&(r.rank===sorted[i-1].rank?r.count!==sorted[i-1].count:r.count>sorted[i-1].count)))throw new Error('Statistics rank and count disagree');
  if(source.snapshot_format==='normalized-facts'){
    const extract=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(snapshot));
    if(extract.url!==source.url||JSON.stringify(extract.scope)!==JSON.stringify(scope)||JSON.stringify(extract.rows)!==JSON.stringify(rows))throw new Error('Statistics extract differs from rows or scope');
  }
  return {...batch,rows:sorted};
}
export function nameCandidateDrafts(batch:ReturnType<typeof validateNameStatistics>,existing:readonly string[]){
  const known=new Set(existing.map(name=>name.normalize('NFC')));
  // Aggregate spelling/frequency is never proof of a particular Hanja spelling, gender feel or element.
  return batch.rows.filter(row=>row.name.length===2&&!known.has(row.name)).map(row=>({hangul:row.name,statistics:{rank:row.rank,count:row.count,scope:batch.scope,source:batch.source},review_status:'draft' as const}));
}
