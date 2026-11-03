import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpretChart} from '../src/interpretation.ts';
import {extract} from '../src/features.ts';
import {ganzhi,type Chart} from '../src/ganzhi.ts';
import {isRecommendation} from '../app/me/experience-state.ts';

const chart:Chart={year:'甲辰',month:'丙子',day:'甲子',hour:'丁卯'};
const prose=(value:ReturnType<typeof interpretChart>)=>value.sections.flatMap(section=>section.paragraphs).join(' ');

test('readable chart sections depend only on pillars, never the name or input story',()=>{
  const result=interpretChart(chart);
  assert.deepEqual(interpretChart({...chart,...{story:'synthetic input',name:'fixture name'}}),result);
  assert.equal('nameReason' in result,false);
  assert.doesNotMatch(JSON.stringify(result),/synthetic input|fixture name|이야기|이 이름을/);
  assert.deepEqual(result.sections.map(section=>section.title),['전체적인 성향','일과 재능','돈을 대하는 방식','인간관계와 연애']);
  assert.doesNotMatch(prose(result),/일간|월지|본기|십성|비겁|재성|통근|투간|투출|용신|표지|M0\d\d/);
  assert.match(result.basis.find(fact=>fact.label==='일간과 오행')!.text,/甲\(갑\).*목\(木\)/);
});

test('work, money and relationship readings change with the calculated dominant relationship',()=>{
  const fixtures=[
    {pillar:'甲寅',work:/스스로 결정할 몫/,money:/각자의 몫/,relationships:/서로의 선택/},
    {pillar:'丙午',work:/결과물/,money:/익힌 기술/,relationships:/말과 행동/},
    {pillar:'戊辰',work:/목표와 결과/,money:/관리하고 사용/,relationships:/필요한 것을 챙겨/},
    {pillar:'庚申',work:/역할과 기준/,money:/약속과 책임/,relationships:/약속을 지키고/},
    {pillar:'壬子',work:/자기 전문성/,money:/납득할 만한 이유/,relationships:/충분히 들어주고/},
  ];
  for(const fixture of fixtures){
    const result=interpretChart({year:fixture.pillar,month:fixture.pillar,day:'甲寅',hour:fixture.pillar});
    assert.match(result.sections[1].paragraphs.join(' '),fixture.work);
    assert.match(result.sections[2].paragraphs.join(' '),fixture.money);
    assert.match(result.sections[3].paragraphs.join(' '),fixture.relationships);
    for(const section of result.sections)assert.ok(section.ruleIds.length>0);
  }
});

test('tied leading groups all contribute instead of arbitrarily choosing one personality',()=>{
  const result=interpretChart(chart);
  // This fixture has two self, two output and two resource positions, plus one wealth.
  assert.equal(result.sections[1].paragraphs.length,3);
  for(const id of ['M001','M003','M010'])assert.ok(result.sections[1].ruleIds.includes(id));
  assert.match(result.basis.find(fact=>fact.label==='십성 분포')!.text,/비겁 2곳, 식상 2곳, 재성 1곳, 관성 0곳, 인성 2곳/);
});

test('root and join details remain factual while a clash adds a concrete relationship theme',()=>{
  const unrooted=interpretChart({year:'庚申',month:'辛酉',day:'甲子',hour:'癸酉'});
  assert.match(unrooted.basis.find(fact=>fact.label==='뿌리와 드러난 기운')!.text,/같은 오행이 없습니다/);
  assert.equal(unrooted.references.some(reference=>reference.ruleId==='M022'),false);
  const related=interpretChart({year:'甲子',month:'己丑',day:'丙午',hour:'庚寅'});
  assert.match(related.basis.find(fact=>fact.label==='합과 충')!.text,/천간합 짝·육합 짝/);
  assert.match(related.sections[3].paragraphs.join(' '),/함께할 부분과 각자 선택할 부분/);
  for(const id of ['M023','M024','M027'])assert.ok(related.sections[3].ruleIds.includes(id));
});

test('varied pillar combinations keep frontend bounds and reference only calculated facts',()=>{
  for(let index=0;index<180;index++){
    const value={year:ganzhi(index),month:ganzhi(index*7+1),day:ganzhi(index*11+3),hour:ganzhi(index*13+5)};
    const result=interpretChart(value),calculated=extract(value);
    assert.equal(isRecommendation({chartId:'a'.repeat(64),fictionalBirth:{city:'seoul',civilTime:'2024-01-01 00:00:00',utcOffsetMinutes:540},pillars:Object.values(value),name:{name:'은지',hanja:'恩智',kind:'hanja',meaning:'fixture',wordMeaning:null,sourceUrl:'https://efamily.scourt.go.kr/'},interpretation:result}),true);
    assert.ok(result.references.every(reference=>calculated.some(feature=>feature.ruleId===reference.ruleId&&feature.priority>=2&&feature.family!=='신살·운성')));
    assert.ok(result.sections.every(section=>section.ruleIds.every(id=>result.references.some(reference=>reference.ruleId===id))));
    assert.doesNotMatch(prose(result),/초년|중년|말년|대운|세운|질병|결혼 시기|반드시|운명/);
  }
});

test('invalid sexagenary pairs cannot generate a plausible reading',()=>{
  for(const day of ['甲丑','unknown',''])assert.throws(()=>interpretChart({...chart,day}),/Invalid chart/);
});
