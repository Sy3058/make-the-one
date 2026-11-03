import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpretChart} from '../src/interpretation.ts';
import {extract} from '../src/features.ts';
import type {Chart} from '../src/calendar.ts';

const chart:Chart={year:'甲辰',month:'丙子',day:'甲子',hour:'丁卯'};

test('reading depends only on the four pillars, independently of story and name',()=>{
  const result=interpretChart(chart);
  const withUnrelatedInput={...chart,story:'synthetic unrelated story',name:'fixture name'};
  assert.deepEqual(interpretChart(withUnrelatedInput),result);
  assert.equal(result.kind,'chart');
  assert.equal('nameReason' in result,false);
  assert.equal('matchedMotifs' in result,false);
  assert.doesNotMatch(JSON.stringify(result),/synthetic|fixture|이야기|이 이름을/);
  assert.ok(result.paragraphs.length>=4&&result.paragraphs.length<=6);
});

test('reading describes the actual day stem, season and rooted structure',()=>{
  const result=interpretChart(chart);
  const text=result.paragraphs.join(' ');
  assert.match(text,/甲\(갑\).*목\(木\)/);
  assert.match(text,/월지는 子/);
  assert.match(text,/통근 표지가 확인/);
  assert.ok(result.references.some(reference=>reference.ruleId==='M014'));
  assert.ok(result.references.some(reference=>reference.ruleId==='M016'));
  assert.ok(result.references.some(reference=>reference.ruleId==='M022'));
  const calculated=extract(chart);
  assert.ok(result.references.every(reference=>calculated.some(feature=>feature.ruleId===reference.ruleId&&feature.priority>=2&&feature.family!=='신살·운성')));
  assert.doesNotMatch(text,/초년|중년|장년|대운|세운/);
});

test('unrooted charts do not receive a rooted reading or unsupported relationship facts',()=>{
  const result=interpretChart({year:'庚申',month:'辛酉',day:'甲子',hour:'癸酉'});
  assert.match(result.paragraphs.join(' '),/뿌리가 확인되지 않습니다/);
  assert.equal(result.references.some(reference=>reference.ruleId==='M022'),false);
  assert.equal(result.references.some(reference=>reference.ruleId==='M027'),false);
});

test('actual joins and clashes are included even without story motif overlap',()=>{
  const result=interpretChart({year:'甲子',month:'己丑',day:'丙午',hour:'庚寅'});
  assert.match(result.paragraphs.join(' '),/천간합 짝/);
  assert.match(result.paragraphs.join(' '),/육합 짝/);
  assert.match(result.paragraphs.join(' '),/충/);
  for(const id of ['M023','M024','M027'])assert.ok(result.references.some(reference=>reference.ruleId===id));
});

test('invalid sexagenary pairs cannot generate a plausible chart reading',()=>{
  for(const day of ['甲丑','unknown',''])assert.throws(()=>interpretChart({...chart,day}),/Invalid chart/);
});
