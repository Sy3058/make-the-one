import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateNameStatistics,nameCandidateDrafts} from '../src/name-statistics.ts';
// Synthetic aggregate fixture, not a captured court statistic.
const snapshot=new TextEncoder().encode('synthetic aggregate fixture');
const fixture=()=>({version:'court-name-statistics-v1',source:{url:'https://stfamily.scourt.go.kr/st/StFrrStatcsInq.do',publisher:'official',upstream_url:'https://stfamily.scourt.go.kr/st/StFrrStatcsInq.do',snapshot_sha256:createHash('sha256').update(snapshot).digest('hex'),captured_at:'2026-11-04'},
  scope:{from:'2025-01-01',to:'2025-12-31',as_of:'2026-11-03',region:'전국',sex:'combined',coverage:'top-n',limit:20},
  rows:[{name:'하림',rank:1,count:10},{name:'서현',rank:2,count:8},{name:'하늘별',rank:3,count:3}]});
test('statistics carry period, geography, sex, top-n coverage and snapshot evidence into draft candidates',()=>{
  const result=validateNameStatistics(fixture(),snapshot);
  const drafts=nameCandidateDrafts(result,['서현'.normalize('NFD')]);
  assert.equal(drafts.length,1);assert.equal(drafts[0].hangul,'하림');assert.equal(drafts[0].review_status,'draft');
  assert.deepEqual(drafts[0].statistics.scope,result.scope);assert.equal('hanja' in drafts[0],false);assert.equal('elements' in drafts[0],false);
});
test('changed snapshots, invented coverage and inconsistent rank/count metadata are rejected',()=>{
  assert.throws(()=>validateNameStatistics(fixture(),new Uint8Array()),/checksum/);
  for(const scope of [{from:'2027-01-01'},{as_of:'2024-12-31'},{as_of:'2027-01-01'},{limit:null},{coverage:'full'}]){
    const batch=fixture();Object.assign(batch.scope,scope);assert.throws(()=>validateNameStatistics(batch,snapshot));
  }
  const outside=fixture();outside.rows[2].rank=21;assert.throws(()=>validateNameStatistics(outside,snapshot),/coverage/);
  const order=fixture();order.rows[1].count=11;assert.throws(()=>validateNameStatistics(order,snapshot),/rank and count/);
  const tie=fixture();tie.rows[1].rank=1;assert.throws(()=>validateNameStatistics(tie,snapshot),/rank and count/);
});
test('canonical duplicate spellings and individual-person fields cannot enter aggregate imports',()=>{
  const duplicate=fixture();duplicate.rows[1].name='하림'.normalize('NFD');assert.throws(()=>validateNameStatistics(duplicate,snapshot),/Duplicate/);
  for(const extra of [{story:'private narrative'},{birthDate:'2000-01-01'},{identifier:'person-id'}]){
    const batch=fixture();Object.assign(batch.rows[0],extra);assert.throws(()=>validateNameStatistics(batch,snapshot));
  }
});
test('secondary sources require opt-in and cannot claim to be a court host',()=>{
  const batch=fixture();batch.source.url='https://example.com/aggregate';batch.source.publisher='secondary';
  assert.throws(()=>validateNameStatistics(batch,snapshot),/opt-in/);assert.equal(validateNameStatistics(batch,snapshot,{allowSecondary:true}).rows.length,3);
  batch.source.publisher='official';assert.throws(()=>validateNameStatistics(batch,snapshot,{allowSecondary:true}),/Court source/);
});


test('checked-in secondary extracts validate their hashes, scopes and rows without inventing Hanja',()=>{
  for(const sex of ['male','female']){
    const json=readFileSync(new URL(`../data/name-statistics/2025-${sex}.json`,import.meta.url),'utf8');
    const raw=readFileSync(new URL(`../data/name-statistics/2025-${sex}.snapshot.json`,import.meta.url));
    const batch=validateNameStatistics(JSON.parse(json),raw,{allowSecondary:true});
    assert.equal(batch.rows.length,20);assert.equal(batch.scope.sex,sex);assert.equal(batch.scope.as_of,'2026-10-11');
    const changed=JSON.parse(json);changed.rows[0].count++;assert.throws(()=>validateNameStatistics(changed,raw,{allowSecondary:true}),/extract differs/);
  }
});
