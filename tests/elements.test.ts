import {test} from 'node:test';
import assert from 'node:assert/strict';
import {elementDistribution,elementSupport,elements} from '../src/elements.ts';
import {ganzhi} from '../src/ganzhi.ts';
import associations from '../data/name-elements.json' with {type:'json'};
import {validateElementAssociations,reviewedNameElements} from '../src/name-elements.ts';
test('eight visible characters include the day stem and each branch exactly once',()=>{
  const result=elementDistribution({year:'甲子',month:'丙寅',day:'戊辰',hour:'庚午'});
  assert.deepEqual(result.counts,{wood:2,fire:2,earth:2,metal:1,water:1});assert.deepEqual(result.targets,['metal','water']);
  const missing=elementDistribution({year:'甲寅',month:'乙卯',day:'甲寅',hour:'乙卯'});
  assert.deepEqual(missing.counts,{wood:8,fire:0,earth:0,metal:0,water:0});assert.deepEqual(missing.targets,['fire','earth','metal','water']);
});
test('all sixty stems and branches stay within eight contributions without hidden-stem double counting',()=>{
  for(let i=0;i<60;i++){
    const chart={year:ganzhi(i),month:ganzhi(i+7),day:ganzhi(i+13),hour:ganzhi(i+29)};
    const result=elementDistribution(chart);
    assert.equal(Object.values(result.counts).reduce((sum,n)=>sum+n,0),8);
    assert.ok(result.targets.length>0);assert.ok(result.targets.every(e=>result.counts[e]===Math.min(...Object.values(result.counts))));
  }
  for(const pillar of ['XX','甲子子','甲','甲🐈','子甲'])assert.throws(()=>elementDistribution({year:pillar,month:'甲子',day:'甲子',hour:'甲子'}));
});
test('unknown name materials do not masquerade as a needed element or inflate partial coverage',()=>{
  assert.equal(elementSupport(['water',null],['water']),0.5);
  assert.equal(elementSupport([null,null],elements),0);assert.equal(elementSupport([],elements),0);
  assert.equal(elementSupport(['fire','wood'],['water']),0);
  assert.deepEqual(reviewedNameElements({name_kind:'hanja',hangul:'서현',hanja:'瑞賢'}),[null,null]);
  assert.deepEqual(reviewedNameElements({name_kind:'hanja',hangul:'하림',hanja:'河林'}),['water','wood']);
  assert.deepEqual(reviewedNameElements({name_kind:'native',hangul:'이슬',hanja:null}),['water']);
  assert.deepEqual(reviewedNameElements({name_kind:'native',hangul:'하늘',hanja:null}),[null]);
});
test('semantic associations are bound to the reviewed character/word gloss and provenance',()=>{
  const parsed=validateElementAssociations();assert.equal(Object.keys(parsed.characters).length,33);
  assert.ok(Object.values(parsed.characters).some(entry=>entry.element===null));
  for(const change of ['gloss','source_url','source_sha256'] as const){
    const value=structuredClone(associations);value.characters.河[change]=change==='source_url'?'https://example.com/':change==='source_sha256'?'a'.repeat(64):'검수하지 않은 뜻';
    assert.throws(()=>validateElementAssociations(value),/evidence differs/);
  }
  const native=structuredClone(associations);native.native_names.이슬.gloss='불';assert.throws(()=>validateElementAssociations(native),/evidence differs/);
  const missing=structuredClone(associations);Reflect.deleteProperty(missing.characters,'河');assert.throws(()=>validateElementAssociations(missing),/coverage/);
});
