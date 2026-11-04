import male from '../data/name-statistics/2025-male.json' with {type:'json'};
import female from '../data/name-statistics/2025-female.json' with {type:'json'};
const batches={'2025-male.json':male,'2025-female.json':female};
export function statisticForName(reference:string,hangul:string){
  const match=/^name-statistics\/(2025-(?:male|female)\.json)#([가-힣]{2})$/.exec(reference);
  if(!match||match[2]!==hangul)throw new Error('Name statistic reference differs');
  const batch=batches[match[1] as keyof typeof batches],row=batch.rows.find(row=>row.name===hangul);
  if(!row)throw new Error('Name absent from referenced statistics');
  return {source:batch.source,scope:batch.scope,...row};
}
