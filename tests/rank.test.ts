import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chartScore,finalScore,pickNames,type Evidence,type Motif,type Name} from '../src/rank.ts';
const motifs:Motif[]=[{tag:'전환',importance:3,quote:'새로 시작했다',negative:false,transition:true},
  {tag:'기반',importance:2,quote:'뿌리를 찾았다',negative:false,transition:false}];
const e:Evidence[]=[{chart_id:'a',rule_id:'M027',motif:'전환',priority:3,family:'상호작용',evidence:{}},
  {chart_id:'a',rule_id:'M022',motif:'기반',priority:3,family:'상호작용',evidence:{}},
  {chart_id:'a',rule_id:'M047',motif:'기반',priority:3,family:'복합 장면',evidence:{}}];
test('weak star cannot admit a chart without a structural anchor',()=>{
  assert.equal(chartScore(motifs,[{...e[0],family:'신살·운성',priority:1}]),null);
  assert.ok((chartScore(motifs,e)??0)>70);
  assert.ok(finalScore(80,60)>finalScore(70,60));
});
test('name set has three different initials and meaning tags plus one playful',()=>{
  const names:Name[]=[
    {name_id:'1',hangul:'가온',meaning_ko:'중심',motif_tags:['기반'],style_tags:['중립적'],naturalness:5,is_playful:false},
    {name_id:'2',hangul:'나래',meaning_ko:'날개',motif_tags:['전환'],style_tags:['중립적'],naturalness:4,is_playful:false},
    {name_id:'3',hangul:'도담',meaning_ko:'건강한 성장',motif_tags:['성장','전환'],style_tags:['중립적'],naturalness:4,is_playful:false},
    {name_id:'4',hangul:'다온',meaning_ko:'오는 것',motif_tags:['기반'],style_tags:[],naturalness:4,is_playful:true}];
  const x=pickNames(names,motifs);
  assert.equal(x?.serious.length,3);assert.equal(x?.playful.name.hangul,'다온');
});
