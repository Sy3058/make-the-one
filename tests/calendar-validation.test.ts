import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pillars,solarClock,occurrence,type Place} from '../src/calendar.ts';
import {validateSolarTerms} from '../src/calendar-validation.ts';
import places from '../data/places.json' with {type:'json'};
import {civilYearWindow} from '../src/index-window.ts';
const require=createRequire(import.meta.url);
const {Solar}=require('lunar-javascript');

test('all recorded published KASI minute references stay within one minute',()=>{
  const result=validateSolarTerms();
  assert.equal(result.checked,1440);
  assert.ok(result.maxRoundedErrorMinutes<=1);
  assert.ok(result.maxRawErrorSeconds>60); // Published reference precision is not hidden.
});
test('KASI gate rejects a corrupt reference instead of allowing an index build',()=>{
  assert.throws(()=>validateSolarTerms([{year:2024,longitude:315,kst:'2024-02-04T17:30:00+09:00'}]),/gate failed/);
  assert.throws(()=>validateSolarTerms([]),/missing/);
});
test('360 non-boundary samples independently agree with lunar-javascript 1.7.7',()=>{
  let checked=0;
  for(const year of [1980,1984,1987,1988,1999,2000,2024,2025,2039]){
    for(const month of [0,2,5,8,11])for(const hour of [3,15]){
      for(const place of places.filter(p=>['seoul','seongnam','sokcho','mokpo'].includes(p.id))){
        const utc=new Date(Date.UTC(year,month,15,hour)),solar=solarClock(utc,place.longitude);
        assert.ok(occurrence(utc,place).boundaryDistanceMin>=15);
        const independent=Solar.fromYmdHms(solar.getUTCFullYear(),solar.getUTCMonth()+1,solar.getUTCDate(),solar.getUTCHours(),solar.getUTCMinutes(),solar.getUTCSeconds()).getLunar().getEightChar();
        independent.setSect(1); // Match the declared 23:00 day change, away from solar terms.
        assert.deepEqual(pillars(utc,place),{year:independent.getYear(),month:independent.getMonth(),day:independent.getDay(),hour:independent.getTime()},`${utc.toISOString()} ${place.id}`);
        checked++;
      }
    }
  }
  assert.equal(checked,360);
});
test('solar 23:00 changes day, while solar midnight keeps the same day',()=>{
  const place=places.find(p=>p.id==='seoul')! as Place;
  const utcAt=(hour:number)=>new Date(Date.UTC(2024,5,15,hour)-place.longitude*240_000);
  const boundary=utcAt(23);
  const before=pillars(new Date(boundary.getTime()-1),place),at=pillars(boundary,place);
  assert.notEqual(before.day,at.day);
  const midnight=utcAt(24);
  assert.equal(pillars(new Date(midnight.getTime()-1),place).day,pillars(midnight,place).day);
});
test('index bounds follow Seoul civil years and reject invalid ranges',()=>{
  assert.deepEqual(civilYearWindow(2024,2024),{start:Date.parse('2024-01-01T00:00:00+09:00'),end:Date.parse('2025-01-01T00:00:00+09:00')});
  assert.equal(civilYearWindow(1980,2039).end,Date.parse('2040-01-01T00:00:00+09:00'));
  for(const pair of [[NaN,2024],[2024.5,2025],[1979,2024],[2024,2040],[2025,2024]]) assert.throws(()=>civilYearWindow(pair[0],pair[1]));
});
test('1988 repeated civil hour keeps both UTC instants and distinct offsets',()=>{
  const place=places.find(p=>p.id==='seoul')!;
  const first=occurrence(new Date('1988-10-08T16:30:00Z'),place);
  const second=occurrence(new Date('1988-10-08T17:30:00Z'),place);
  assert.equal(first.civil,'1988-10-09 02:30:00');
  assert.equal(second.civil,first.civil);
  assert.equal(first.utcOffsetMin,600);
  assert.equal(second.utcOffsetMin,540);
  assert.notEqual(first.utc.toISOString(),second.utc.toISOString());
});
