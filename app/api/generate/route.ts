import {NextResponse} from 'next/server';
import {generationInput} from '../../../src/generation-input';
import {extractMotifs,MetaServiceError} from '../../../src/meta';
import {candidates,verifiedNames} from '../../../src/db';
import {pickPairs} from '../../../src/rank';
import {interpretChart} from '../../../src/interpretation';
export async function POST(req:Request){
  let stage:'input'|'model'|'database'|'ranking'='input';
  const started=performance.now();
  let stageStarted=started;
  const durations={input:0,model:0,database:0,ranking:0};
  const endStage=()=>{
    const now=performance.now();durations[stage]+=now-stageStarted;stageStarted=now;
  };
  try {
    const body=generationInput.safeParse(await req.json());
    if(!body.success)return NextResponse.json({error:'이야기와 이름 느낌, 출생연도 범위(1980~2039년)를 확인해 주세요.'},{status:400});
    endStage();stage='model';
    const motifs=await extractMotifs(body.data.story);
    endStage();stage='database';
    const rows=await candidates(motifs,body.data.yearRange);
    const names=(await verifiedNames()).filter(n=>n.hangul!==body.data.existingName);
    if(names.length<3)return NextResponse.json({error:'검증된 이름 자료를 준비 중입니다.'},{status:503});
    endStage();stage='ranking';
    const pairs=pickPairs(rows,names,motifs,body.data.style,body.data.nameFeel);
    if(!pairs)return NextResponse.json({error:'조건에 맞는 서로 다른 사주와 이름 세 쌍을 찾지 못했어요. 출생연도 범위를 넓히거나 이름 느낌을 바꿔 주세요.'},{status:422});
    const recommendations=pairs.map(({row,name})=>({
      chartId:row.id,
      name:{name:name.hangul,hanja:name.hanja,kind:name.name_kind,meaning:name.meaning_ko,wordMeaning:name.word_meaning,sourceUrl:name.source_url},
      fictionalBirth:{city:row.occurrence.place_id,civilTime:row.occurrence.civil_time,utcOffsetMinutes:row.occurrence.utc_offset_min,utc:row.occurrence.instant_utc},
      pillars:[row.chart.year_pillar,row.chart.month_pillar,row.chart.day_pillar,row.chart.hour_pillar],
      interpretation:interpretChart({year:row.chart.year_pillar,month:row.chart.month_pillar,day:row.chart.day_pillar,hour:row.chart.hour_pillar}),
      evidence:row.evidence.filter(e=>e.priority>=2&&e.family!=='신살·운성').slice(0,2).map(e=>({ruleId:e.rule_id,motif:e.motif})),
      shareText:`이야기에서 찾은 가상의 사주와 이름: ${name.hangul} #MakeTheOne`,
    }));
    return NextResponse.json({recommendations,motifs:motifs.map(m=>({tag:m.tag,importance:m.importance})),
      versions:{policy:'kr-mean-solar-23-v1',ruleset:'mt1-v1',ranking:'three-pairs-v1',names:'ko-names-v2',model:'muse-spark-1.3'}});
  } catch(error) {
    if(error instanceof MetaServiceError){
      console.error('generate failed',{stage,code:error.code,upstreamStatus:error.upstreamStatus});
      const status=error.code==='MODEL_TIMEOUT'?504:error.code==='MODEL_RESPONSE_INVALID'?502:503;
      return NextResponse.json({code:error.code,error:error.message},{status});
    }
    const code=stage==='database'?'DATABASE_UNAVAILABLE':stage==='input'?'INVALID_INPUT':'GENERATION_FAILED';
    console.error('generate failed',{stage,code});
    const message=stage==='database'?'이름 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
      :stage==='input'?'이야기를 30~1200자로 입력해 주세요.'
      :'지금은 결과를 만들 수 없습니다. 잠시 후 다시 시도해 주세요.';
    return NextResponse.json({code,error:message},{status:stage==='input'?400:503});
  }finally{
    endStage();
    console.info('generation timing',{inputMs:Math.round(durations.input),modelMs:Math.round(durations.model),
      databaseMs:Math.round(durations.database),rankingMs:Math.round(durations.ranking),totalMs:Math.round(performance.now()-started)});
  }
}
