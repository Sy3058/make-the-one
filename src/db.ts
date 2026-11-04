import pg from 'pg';
import {reviewedNameElements} from './name-elements';
import type {Evidence,NameDetails,Motif} from './rank';
import {validateNameCorpus} from './name-corpus';
import type {YearRange} from './generation-input';
const {Pool}=pg;
let pool:pg.Pool|undefined;
export function db(){if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL unavailable');
  return pool??=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:5_000,statement_timeout:10_000});}
export async function candidates(motifs:Motif[],range?:YearRange){
  const positive=motifs.filter(m=>!m.negative);
  if(!positive.length) return [];
  const tags=positive.map(m=>m.tag);
  const main=positive.reduce((a,b)=>a.importance>=b.importance?a:b).tag;
  const p=db();
  const ids=await p.query<{chart_id:string}>(`SELECT chart_id FROM chart_motif WHERE motif=ANY($1)
    AND priority>=2 AND family<>'신살·운성'
    AND EXISTS (SELECT 1 FROM chart_occurrence o WHERE o.chart_id=chart_motif.chart_id AND o.is_representative
      AND o.civil_time >= $2::timestamp AND o.civil_time < $3::timestamp) GROUP BY chart_id HAVING bool_or(motif=$4)
    ORDER BY max(priority) DESC, count(DISTINCT family) DESC, chart_id ASC LIMIT 5000`,[tags,`${range?.from??1980}-01-01`,`${(range?.to??2039)+1}-01-01`,main]);
  if(!ids.rows.length)return [];
  const chartIds=ids.rows.map(x=>x.chart_id);
  const [features,charts,occurrences]=await Promise.all([
    p.query<Evidence>(`SELECT chart_id,rule_id,motif,priority,family,evidence FROM chart_motif
      WHERE chart_id=ANY($1) AND motif=ANY($2)`,[chartIds,tags]),
    p.query<{chart_id:string;year_pillar:string;month_pillar:string;day_pillar:string;hour_pillar:string}>(`SELECT * FROM chart WHERE chart_id=ANY($1)`,[chartIds]),
    // Keep the local civil timestamp as text; pg's Date parser applies the server timezone.
    p.query<{chart_id:string;place_id:string;instant_utc:string;civil_time:string;utc_offset_min:number;boundary_distance_min:number}>(`SELECT DISTINCT ON (chart_id) chart_id,place_id,instant_utc,civil_time::text AS civil_time,utc_offset_min,boundary_distance_min
      FROM chart_occurrence WHERE chart_id=ANY($1) AND is_representative=true AND civil_time >= $2::timestamp AND civil_time < $3::timestamp
      ORDER BY chart_id,boundary_distance_min DESC,instant_utc,place_id`,[chartIds,`${range?.from??1980}-01-01`,`${(range?.to??2039)+1}-01-01`])
  ]);
  const c=new Map(charts.rows.map(x=>[x.chart_id,x]));
  const o=new Map(occurrences.rows.map(x=>[x.chart_id,x]));
  const evidenceByChart=new Map<string,Evidence[]>();
  for(const evidence of features.rows){
    const list=evidenceByChart.get(evidence.chart_id)??[];list.push(evidence);evidenceByChart.set(evidence.chart_id,list);
  }
  return chartIds.flatMap(id=>c.has(id)&&o.has(id)?[{id,chart:c.get(id)!,occurrence:o.get(id)!,
    evidence:evidenceByChart.get(id)??[]}]:[]);
}
export async function verifiedNames():Promise<NameDetails[]> {
  const corpus=validateNameCorpus();
  const r=await db().query(`SELECT name_id,hangul,hanja,reading_verified,meaning_ko,motif_tags,style_tags,naturalness,is_playful,corpus_version
    FROM name_entry WHERE review_status='verified' AND is_playful=false ORDER BY name_id`);
  const source=new Map(corpus.entries.map(n=>[n.name_id,n]));
  return r.rows.flatMap(row=>{
    const entry=source.get(row.name_id);
    const fields=['hangul','hanja','reading_verified','meaning_ko','motif_tags','style_tags','naturalness','is_playful','corpus_version'] as const;
    if(!entry||entry.name_kind==='nickname'||fields.some(field=>JSON.stringify(row[field])!==JSON.stringify(entry[field])))return [];
    return [{...entry,name_kind:entry.name_kind,elements:reviewedNameElements({...entry,name_kind:entry.name_kind})}];
  });
}
