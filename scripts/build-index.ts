import {createWriteStream,mkdirSync} from 'node:fs';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import places from '../data/places.json' with {type:'json'};
import {nearbyTerms,occurrence,solarTerms,type Place} from '../src/calendar.ts';
import {extract} from '../src/features.ts';
const yearFrom=Number(process.argv[2]??2024),yearTo=Number(process.argv[3]??yearFrom);
const cityArg=process.argv[4]??'seoul,seongnam,sokcho,mokpo';
const selected=(cityArg==='all'?places:places.filter(p=>cityArg.split(',').includes(p.id))) as Place[];
if(yearFrom<1980||yearTo>2039||yearFrom>yearTo||!selected.length) throw new Error('invalid year or places');
const out=process.argv[5]??'data/generated';
mkdirSync(out,{recursive:true});
const seen=new Set<string>();
const hash=createHash('sha256');
let count=0,motifCount=0,representative=0;
const writers=Object.fromEntries(['charts','occurrences','motifs'].map(kind=>{
  const gz=createGzip(); gz.pipe(createWriteStream(`${out}/${kind}.jsonl.gz`));
  return [kind,gz];
})) as Record<string,ReturnType<typeof createGzip>>;
async function write(kind:string,row:unknown) {
  const line=JSON.stringify(row)+'\n';
  if(!writers[kind].write(line)) await once(writers[kind],'drain');
}
const START=Date.UTC(yearFrom,0,1),END=Date.UTC(yearTo+1,0,1);
for(const place of selected){
  console.error(`building ${place.id} (${selected.indexOf(place)+1}/${selected.length})`);
  let t=Date.UTC(yearFrom-1,11,30,23)-place.longitude*240_000;
  const end=END+2*86_400_000;
  while(t<end) {
    const next=t+7_200_000;
    const jie=nearbyTerms(new Date(t)).filter(x=>x.isJie&&x.utc.getTime()>t&&x.utc.getTime()<next);
    const splits=[t,...jie.map(x=>x.utc.getTime()),next];
    for(let j=0;j<splits.length-1;j++){
      const mid=Math.round((splits[j]+splits[j+1])/2);
      if(mid<START||mid>=END) continue;
      const row=occurrence(new Date(mid),place);
      const valid=row.boundaryDistanceMin>=15;
      if(valid) representative++;
      if(!seen.has(row.chartId)) {
        seen.add(row.chartId);
        const features=extract(row.chart);
        await write('charts',{chart_id:row.chartId,policy_id:'kr-mean-solar-23-v1',...row.chart,
          features:features.map(x=>({rule_id:x.ruleId,priority:x.priority,family:x.family,evidence:x.evidence}))});
        for(const f of features) {
          if(f.priority===0) continue;
          for(const motif of f.motifs){await write('motifs',{chart_id:row.chartId,rule_id:f.ruleId,
            motif,priority:f.priority,family:f.family,evidence:{rule_ref:f.ruleId},ruleset_version:'mt1-v1',source_url:f.source});motifCount++;}
        }
      }
      await write('occurrences',{chart_id:row.chartId,place_id:place.id,instant_utc:row.utc.toISOString(),
        civil_time:row.civil,utc_offset_min:row.utcOffsetMin,solar_time:row.solar,
        boundary_distance_min:Number(row.boundaryDistanceMin.toFixed(2)),is_representative:valid});
      hash.update([row.chartId,place.id,row.utc.toISOString()].join('|')+'\n');
      count++;
    }
    t=next;
  }
}
for(const stream of Object.values(writers)){stream.end();await once(stream,'end');}
const manifest={policy_id:'kr-mean-solar-23-v1',years:[yearFrom,yearTo],places:selected.map(p=>p.id),
  chart_count:seen.size,occurrence_count:count,motif_count:motifCount,representative_count:representative,
  checksum_sha256:hash.digest('hex'),status:'draft',timestamp:new Date().toISOString()};
const fs=await import('node:fs/promises');
await fs.writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(`${out}/solar_terms.json`,JSON.stringify(Array.from({length:yearTo-yearFrom+2},(_,i)=>
  solarTerms(yearFrom+i).map(t=>({year:t.year,longitude:t.longitude,instant_utc:t.utc.toISOString()}))).flat(),null,2)+'\n');
console.log(JSON.stringify(manifest));
