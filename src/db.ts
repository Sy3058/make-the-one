import pg from 'pg';
import type {Evidence,Name,Motif} from './rank';
const {Pool}=pg;
let pool:pg.Pool|undefined;
export function db(){if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL unavailable');
  return pool??=new Pool({connectionString:process.env.DATABASE_URL,max:5,statement_timeout:10_000});}
export async function candidates(motifs:Motif[]){
  const tags=motifs.filter(m=>!m.negative).map(m=>m.tag);
  if(!tags.length) return [];
  const p=db();
  const ids=await p.query<{chart_id:string}>(`SELECT chart_id FROM chart_motif WHERE motif=ANY($1)
    AND priority>=2 AND family<>'신살·운성' GROUP BY chart_id
    ORDER BY max(priority) DESC, count(DISTINCT family) DESC, chart_id ASC LIMIT 5000`,[tags]);
  if(!ids.rows.length)return [];
  const chartIds=ids.rows.map(x=>x.chart_id);
  const [features,charts,occurrences]=await Promise.all([
    p.query<Evidence>(`SELECT chart_id,rule_id,motif,priority,family,evidence FROM chart_motif
      WHERE chart_id=ANY($1) AND motif=ANY($2)`,[chartIds,tags]),
    p.query<{chart_id:string;year_pillar:string;month_pillar:string;day_pillar:string;hour_pillar:string}>(`SELECT * FROM chart WHERE chart_id=ANY($1)`,[chartIds]),
    p.query<{chart_id:string;place_id:string;instant_utc:string;civil_time:string;boundary_distance_min:number}>(`SELECT DISTINCT ON (chart_id) chart_id,place_id,instant_utc,civil_time,boundary_distance_min
      FROM chart_occurrence WHERE chart_id=ANY($1) AND is_representative=true
      ORDER BY chart_id,boundary_distance_min DESC,instant_utc,place_id`,[chartIds])
  ]);
  const c=new Map(charts.rows.map(x=>[x.chart_id,x]));
  const o=new Map(occurrences.rows.map(x=>[x.chart_id,x]));
  return chartIds.flatMap(id=>c.has(id)&&o.has(id)?[{id,chart:c.get(id)!,occurrence:o.get(id)!,
    evidence:features.rows.filter(x=>x.chart_id===id)}]:[]);
}
export async function verifiedNames():Promise<Name[]> {
  const r=await db().query<Name>(`SELECT name_id,hangul,meaning_ko,motif_tags,style_tags,naturalness,is_playful
    FROM name_entry WHERE review_status='verified' AND (hanja IS NULL OR reading_verified=true)
    ORDER BY name_id`);
  return r.rows;
}
