export type Motif={tag:string;importance:1|2|3;quote:string;negative:boolean;transition:boolean};
export type Evidence={chart_id:string;rule_id:string;motif:string;priority:number;family:string;evidence:unknown};
export type Name={name_id:string;hangul:string;meaning_ko:string;motif_tags:string[];style_tags:string[];
  naturalness:number;is_playful:boolean};
export function chartScore(motifs:Motif[],evidence:Evidence[]){
  const byTag=(tag:string)=>evidence.filter(e=>e.motif===tag);
  const positive=motifs.filter(m=>!m.negative);
  if(!positive.length) return null;
  const main=positive.reduce((a,b)=>a.importance>=b.importance?a:b);
  if(!byTag(main.tag).some(e=>e.priority>=2&&e.family!=='신살·운성')) return null;
  let total=0,weight=0;
  const families=new Set<string>();
  for(const m of motifs){
    if(m.negative) continue; // a negated story motif does not support a positive rule.
    const es=byTag(m.tag);
    const structural=es.filter(e=>e.family!=='신살·운성');
    const p=Math.max(0,...structural.map(e=>e.priority));
    const s=new Set(structural.filter(e=>e.priority>=2).map(e=>e.family)).size>=2?1:0;
    const h=es.some(e=>e.family==='신살·운성'&&e.priority>0)?1:0;
    const e=Math.min(1,p/3+0.15*s+0.05*h);
    total+=m.importance*e;weight+=m.importance;
    if(p>=2) structural.filter(x=>x.priority>=2).forEach(x=>families.add(x.family));
  }
  if(!weight) return null;
  const transition=motifs.some(m=>m.transition)?evidence.some(e=>e.family==='복합 장면'&&e.priority>=2)?1:
    families.size>=2?0.5:0:0;
  return 75*total/weight+15*Math.min(1,families.size/3)+10*transition;
}
export function nameScore(name:Name,motifs:Motif[],style?:string){
  const matched=motifs.filter(m=>!m.negative&&name.motif_tags.includes(m.tag));
  const denominator=motifs.filter(m=>!m.negative).reduce((a,m)=>a+m.importance,0);
  const meaning=matched.length&&denominator?Math.min(1,matched.reduce((a,m)=>a+m.importance,0)/denominator):0;
  return 55*meaning+30*name.naturalness/5+15*(style?Number(name.style_tags.includes(style)):0.5);
}
export function pickNames(names:Name[],motifs:Motif[],style?:string){
  const relevant=new Set(motifs.filter(m=>!m.negative).map(m=>m.tag));
  const sorted=names.filter(n=>!n.is_playful&&n.motif_tags.some(t=>relevant.has(t))).map(n=>({name:n,score:nameScore(n,motifs,style)}))
    .sort((a,b)=>b.score-a.score||a.name.name_id.localeCompare(b.name.name_id));
  const selected:typeof sorted=[];
  for(const item of sorted) {
    if(selected.some(x=>x.name.hangul[0]===item.name.hangul[0])) continue;
    if(selected.some(x=>x.name.motif_tags[0]===item.name.motif_tags[0])) continue;
    selected.push(item); if(selected.length===3) break;
  }
  const playful=names.filter(n=>n.is_playful).map(n=>({name:n,score:nameScore(n,motifs,style)}))
    .sort((a,b)=>b.score-a.score||a.name.name_id.localeCompare(b.name.name_id))[0];
  if(selected.length!==3||!playful) return null;
  return {serious:selected,playful,mean:selected.reduce((a,b)=>a+b.score,0)/3};
}
export function finalScore(c:number,nameMean:number){return 0.8*c+0.2*nameMean;}
