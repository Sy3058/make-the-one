import {test} from 'node:test';
import assert from 'node:assert/strict';
import {experienceReducer,initialState,isResult,isRecommendation,type Result,type Recommendation} from '../app/me/experience-state.ts';

const story='  가상의 인물은 마을에서 책을 읽고 이웃을 돌보며 배움을 이어가고 자신의 생각을 글로 표현했다.  ';
const recommendation:Recommendation={chartId:'a'.repeat(64),fictionalBirth:{city:'seoul',civilTime:'2024-02-15 14:32:05',utcOffsetMinutes:540},pillars:['甲辰','丙寅','己酉','辛未'],
name:{name:'은지',hanja:'恩智',kind:'hanja',meaning:'창작적 이름 풀이',wordMeaning:null,sourceUrl:'https://efamily.scourt.go.kr/'},
interpretation:{kind:'chart',sections:['character','work','money','relationships'].map(id=>({id,title:id,paragraphs:['쉬운 생활 영역별 풀이입니다.']})),basis:[{label:'계산 근거',text:'네 기둥에서 확인한 구성입니다.'}]}};
const second:Recommendation={...recommendation,chartId:'b'.repeat(64),name:{...recommendation.name,name:'하늘',kind:'native',hanja:null,wordMeaning:'땅 위의 넓은 공간'},pillars:['甲辰','丙寅','戊午','辛未']};
const third:Recommendation={...recommendation,chartId:'c'.repeat(64),name:{...recommendation.name,name:'지유'},pillars:['甲辰','丙寅','甲子','辛未']};
const result:Result={recommendations:[recommendation,second,third]};
const entered=()=>experienceReducer(initialState,{type:'edit',story});

test('API success waits for the falling star before revealing names',()=>{
  const loading=experienceReducer(entered(),{type:'start'});
  assert.equal(loading.status,'loading');
  assert.equal(loading.result,null);
  assert.equal(experienceReducer(loading,{type:'complete'}),loading);
  const falling=experienceReducer(loading,{type:'success',result});
  assert.equal(falling.status,'falling');
  const ready=experienceReducer(falling,{type:'complete'});
  assert.equal(ready.status,'ready');
  assert.equal(ready.result,result);
});

test('new name search resets the result while retaining the exact story for resubmission',()=>{
  const loading=experienceReducer(entered(),{type:'start'});
  const falling=experienceReducer(loading,{type:'success',result});
  const ready=experienceReducer(falling,{type:'complete'});
  const reset=experienceReducer(ready,{type:'reset'});
  assert.equal(reset.status,'idle');
  assert.equal(reset.story,story);
  assert.equal(reset.result,null);
  assert.equal(reset.error,'');
  assert.equal(experienceReducer(reset,{type:'start'}).status,'loading');
});

test('request failures restore the input and preserve the story',()=>{
  const loading=experienceReducer(entered(),{type:'start'});
  const failed=experienceReducer(loading,{type:'error',message:'응답 시간 초과'});
  assert.equal(failed.status,'idle');
  assert.equal(failed.story,story);
  assert.equal(failed.error,'응답 시간 초과');
  assert.equal(experienceReducer(failed,{type:'start'}).error,'');
});

test('unfinished searches cannot reset or reveal stale results',()=>{
  const loading=experienceReducer(entered(),{type:'start'});
  assert.equal(experienceReducer(loading,{type:'reset'}),loading);
  assert.equal(experienceReducer(loading,{type:'edit',story:'다른 이야기'}),loading);
  assert.equal(experienceReducer(entered(),{type:'success',result}).result,null);
});

test('three independent charts and names are required; legacy shared results are rejected',()=>{
  assert.equal(isResult(result),true);
  assert.equal(isResult({recommendations:result.recommendations.slice(0,2)}),false);
  assert.equal(isResult({recommendations:[recommendation,null,third]}),false);
  assert.equal(isResult(recommendation),false);
  for(const duplicate of [{...second,chartId:recommendation.chartId},{...second,pillars:recommendation.pillars},{...second,name:recommendation.name}])
    assert.equal(isResult({recommendations:[recommendation,duplicate,third]}),false);
});
test('Hanja and native names enforce their separate display contracts',()=>{
  for(const name of [{...recommendation.name,hanja:null},{...second.name,hanja:'天空'},{...second.name,wordMeaning:null},
    {...second.name,sourceUrl:'javascript:alert(1)'},{...second.name,kind:'nickname'}])
    assert.equal(isRecommendation({...recommendation,name}),false);
  assert.equal(isRecommendation(second),true);
});
test('recommendations require four ordered pillar pairs before they can be revealed',()=>{
  const {pillars,...missing}=recommendation;
  assert.equal(isRecommendation(missing),false);
  assert.equal(isRecommendation({...recommendation,pillars:pillars.slice(0,3)}),false);
  assert.equal(isRecommendation({...recommendation,pillars:[...pillars,'甲子']}),false);
  assert.equal(isRecommendation({...recommendation,pillars:['甲辰','not a pillar','己酉','辛未']}),false);
  assert.equal(isRecommendation({...recommendation,pillars:['甲辰','丙寅',null,'辛未']}),false);
  assert.equal(isRecommendation(recommendation),true);
});
test('birth offsets must be present and use valid integer minutes',()=>{
  const {utcOffsetMinutes,...birthWithoutOffset}=recommendation.fictionalBirth;
  assert.equal(isRecommendation({...recommendation,fictionalBirth:birthWithoutOffset}),false);
  for(const offset of ['540',null,NaN,Infinity,540.5,841,-841]){
    assert.equal(isRecommendation({...recommendation,fictionalBirth:{...recommendation.fictionalBirth,utcOffsetMinutes:offset}}),false);
  }
  assert.equal(isRecommendation(recommendation),true);
  assert.equal(isRecommendation({...recommendation,fictionalBirth:{...recommendation.fictionalBirth,utcOffsetMinutes:600}}),true);
});
test('recommendations require complete readable sections and bounded calculation details',()=>{
  const {interpretation,...without}=recommendation;
  assert.equal(isRecommendation(without),false);
  for(const invalid of [
    {...interpretation,sections:[]},
    {...interpretation,kind:'story'},
    {kind:'chart',paragraphs:['legacy technical reading']},
    {...interpretation,sections:[...interpretation.sections].reverse()},
    {...interpretation,sections:interpretation.sections.map(section=>({...section,paragraphs:['x'.repeat(1501)]}))},
    {...interpretation,sections:[null,...interpretation.sections.slice(1)]},
    {...interpretation,sections:interpretation.sections.map(section=>({...section,paragraphs:[]}))},
    {...interpretation,basis:[]},
    {...interpretation,basis:[{label:'valid',text:null}]},
    {...interpretation,basis:[null]},
  ])assert.equal(isRecommendation({...recommendation,interpretation:invalid}),false);
  assert.equal(isRecommendation(recommendation),true);
});
