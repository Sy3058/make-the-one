import {NextResponse} from 'next/server';
import {z} from 'zod';
import {extractMotifs} from '../../../src/meta';
import {candidates,verifiedNames} from '../../../src/db';
import {chartScore,finalScore,pickNames} from '../../../src/rank';
const input=z.object({mode:z.enum(['me','character']),story:z.string().min(30).max(1200),
  existingName:z.string().max(30).optional(),style:z.enum(['차분함','선명함','고전적','현대적','중립적']).optional()});
export async function POST(req:Request){
  try {
    const body=input.safeParse(await req.json());
    if(!body.success)return NextResponse.json({error:'이야기를 30~1200자로 입력해 주세요.'},{status:400});
    const motifs=await extractMotifs(body.data.story);
    const rows=await candidates(motifs);
    const names=(await verifiedNames()).filter(n=>n.hangul!==body.data.existingName);
    if(!rows.length||names.filter(n=>!n.is_playful).length<3||!names.some(n=>n.is_playful))
      return NextResponse.json({error:'검증된 추천 자료를 준비 중입니다.'},{status:503});
    const ordered=rows.map(row=>({...row,C:chartScore(motifs,row.evidence)}))
      .filter((x):x is typeof x & {C:number}=>x.C!==null)
      .sort((a,b)=>b.C-a.C||a.id.localeCompare(b.id)).slice(0,30);
    const ranked=ordered.flatMap(row=>{const supported=motifs.filter(m=>row.evidence.some(e=>e.motif===m.tag&&e.priority>=2&&e.family!=='신살·운성'));
      const picked=pickNames(names,supported,body.data.style);
      return picked?[{...row,picked,F:finalScore(row.C,picked.mean)}]:[];})
      .sort((a,b)=>b.F-a.F||a.id.localeCompare(b.id));
    const best=ranked[0];
    if(!best)return NextResponse.json({error:'이야기와 맞는 후보를 찾지 못했습니다.'},{status:422});
    return NextResponse.json({fictionalBirth:{city:best.occurrence.place_id,civilTime:best.occurrence.civil_time,
      utc:best.occurrence.instant_utc},pillars:[best.chart.year_pillar,best.chart.month_pillar,best.chart.day_pillar,best.chart.hour_pillar],
      motifs:motifs.map(m=>({tag:m.tag,importance:m.importance})),
      evidence:best.evidence.filter(e=>e.priority>=2&&e.family!=='신살·운성').slice(0,2).map(e=>({ruleId:e.rule_id,motif:e.motif})),
      seriousNames:best.picked.serious.map(x=>({name:x.name.hangul,meaning:x.name.meaning_ko})),
      playfulName:{name:best.picked.playful.name.hangul,meaning:best.picked.playful.name.meaning_ko},
      shareText:`이야기에서 찾은 가상의 사주와 이름: ${best.picked.serious[0].name.hangul} #MakeTheOne`,
      versions:{policy:'kr-mean-solar-23-v1',ruleset:'mt1-v1',model:'muse-spark-1.3'}});
  } catch(error) {
    console.error('generate failed',error instanceof Error?error.message:'unknown');
    return NextResponse.json({error:'지금은 결과를 만들 수 없습니다. 잠시 후 다시 시도해 주세요.'},{status:503});
  }
}
