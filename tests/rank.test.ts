import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chartScore,finalScore,pickNames,nameScore,type Evidence,type Motif,type Name} from '../src/rank.ts';
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
test('three diverse names are returned without requiring a playful candidate',()=>{
  const names:Name[]=[
    {name_id:'1',hangul:'가온',meaning_ko:'중심',motif_tags:['기반'],style_tags:['중립적'],naturalness:5,is_playful:false},
    {name_id:'2',hangul:'나래',meaning_ko:'날개',motif_tags:['전환'],style_tags:['중립적'],naturalness:4,is_playful:false},
    {name_id:'3',hangul:'도담',meaning_ko:'건강한 성장',motif_tags:['성장','전환'],style_tags:['중립적'],naturalness:4,is_playful:false},
    {name_id:'4',hangul:'다온',meaning_ko:'오는 것',motif_tags:['기반'],style_tags:[],naturalness:4,is_playful:true}];
  const x=pickNames(names,motifs);
  assert.equal(x?.serious.length,3);
  assert.ok(x?.serious.every(item=>!item.name.is_playful));
  assert.deepEqual(pickNames(names.filter(n=>!n.is_playful),motifs),x);
  assert.equal(x&&'playful' in x,false);
});

import {pickPairs,matchesNameFeel,type NameDetails} from '../src/rank.ts';
const detail=(id:string,hangul:string,tag:string,feel:'masculine'|'feminine'|'neutral'='neutral'):NameDetails=>({
  name_id:id,hangul,hanja:null,name_kind:'native',name_feels:[feel],word_meaning:'단어 뜻',source_url:'https://krdict.korean.go.kr/',
  meaning_ko:'창작 뜻',motif_tags:[tag],style_tags:[],naturalness:5,is_playful:false,
});
const row=(id:string,tag:string,day='甲子')=>({id,chart:{year_pillar:'甲辰',month_pillar:'丙寅',day_pillar:day,hour_pillar:'辛未'},
  evidence:[{chart_id:id,rule_id:'M001',motif:tag,priority:3,family:'십성',evidence:{}}]});
const twoMotifs:Motif[]=[{tag:'기반',importance:3,quote:'기반',negative:false,transition:false},{tag:'전환',importance:3,quote:'전환',negative:false,transition:false}];
test('name feel admits neutral names, excludes the other preference and never admits playful names',()=>{
  const male=detail('m','태준','기반','masculine'),female=detail('f','서아','기반','feminine'),neutral=detail('n','하늘','기반');
  assert.equal(matchesNameFeel(male,'feminine'),false);assert.equal(matchesNameFeel(female,'masculine'),false);
  for(const feel of ['any','masculine','feminine'] as const)assert.equal(matchesNameFeel(neutral,feel),true);
  assert.equal(pickPairs([row('a','기반'),row('b','기반','戊午'),row('c','기반','庚申')],[male,female,{...neutral,is_playful:true}],twoMotifs),null);
});
test('joint assignment preserves a scarce name for the chart that requires it',()=>{
  const a=row('a','기반'),b=row('b','기반','戊午'),c=row('c','기반','庚申');
  a.evidence.push(row('a','전환').evidence[0]);c.evidence.push(row('c','전환').evidence[0]);
  const rows=[a,b,c];
  const names=[{...detail('1','하늘','기반'),motif_tags:['기반','전환']},detail('2','이슬','전환'),detail('3','나래','전환')];
  const picked=pickPairs(rows,names,twoMotifs);
  assert.ok(picked);assert.equal(picked.length,3);
  assert.equal(picked.find(p=>p.row.id==='b')?.name.hangul,'하늘');
  assert.equal(new Set(picked.map(p=>p.name.hangul)).size,3);
  assert.deepEqual(pickPairs([...rows].reverse(),[...names].reverse(),twoMotifs),picked);
});
test('same pillars with different IDs cannot fill multiple result slots; insufficient matches stay empty',()=>{
  const names=[detail('1','하늘','기반'),detail('2','이슬','기반'),detail('3','나래','기반')];
  assert.equal(pickPairs([row('a','기반'),row('b','기반'),row('c','기반','戊午')],names,twoMotifs),null);
  assert.equal(pickPairs([row('a','기반'),row('b','기반','戊午'),row('c','기반','庚申')],names.slice(0,2),twoMotifs),null);
  assert.ok(pickPairs([row('a','기반'),row('b','기반','戊午'),row('c','기반','庚申')],names,twoMotifs));
});

test('reviewed water materials improve names for water-scarce charts while missing evidence keeps the base score',()=>{
  const rows=[row('a','기반','甲寅'),row('b','기반','乙卯'),row('c','기반','丙午')].map(r=>({...r,chart:{...r.chart,year_pillar:'甲寅',month_pillar:'丙午',hour_pillar:'戊辰'}}));
  const names=[detail('1','서현','기반'),detail('2','민준','기반'),detail('3','지안','기반'),{...detail('4','하림','기반'),elements:['water',null] as const}];
  const plain=pickPairs(rows,names.map(({elements:ignored,...name})=>name),twoMotifs)!;
  const balanced=pickPairs(rows,names.map(n=>({...n,elements:n.elements?[...n.elements]:undefined})),twoMotifs)!;
  assert.ok(!plain.some(p=>p.name.hangul==='하림'));assert.ok(balanced.some(p=>p.name.hangul==='하림'));
  for(const pair of balanced){assert.ok(pair.N>=nameScore(pair.name,twoMotifs.filter(m=>m.tag==='기반')));assert.ok(pair.N<=100);}
  const unknown=pickPairs(rows,names.map(n=>({...n,elements:[null,null]})),twoMotifs)!;
  assert.deepEqual(unknown.map(p=>[p.row.id,p.name.name_id,p.N]),plain.map(p=>[p.row.id,p.name.name_id,p.N]));
  const unrelated={...detail('0','이슬','전환'),elements:['water'] as const};
  assert.ok(!pickPairs(rows,[...names.map(n=>({...n,elements:n.elements?[...n.elements]:undefined})),{...unrelated,elements:[...unrelated.elements]}],twoMotifs)!.some(p=>p.name.name_id==='0'));
});
