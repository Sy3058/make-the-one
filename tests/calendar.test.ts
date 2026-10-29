import {test} from 'node:test';
import assert from 'node:assert/strict';
import moment from 'moment-timezone';
import {occurrence,solarTerms,solarClock,testCivilRoundtrip,chartId, type Place} from '../src/calendar.ts';
import {tenGod,extract} from '../src/features.ts';
import places from '../data/places.json' with {type:'json'};
const seongnam:Place={id:'seongnam',name:'성남',longitude:127.137778,source:'https://www.geonames.org/search.html?country=KR'};
const seoul:Place={id:'seoul',name:'서울',longitude:126.9784,source:'https://www.geonames.org/search.html?country=KR'};
const sokcho=places.find(p=>p.id==='sokcho')!;
const mokpo=places.find(p=>p.id==='mokpo')!;
const calc=(date:string,p:Place)=>occurrence(new Date(date),p);
test('KASI 2024 Li Chun at 17:27 KST; equality belongs to the new term',()=>{
  const t=solarTerms(2024)[0].utc;
  assert.equal(moment.utc(t).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm'),'2024-02-04 17:26');
  assert.ok(Math.abs(t.getTime()-Date.parse('2024-02-04T08:27:00Z'))<60_000);
  assert.equal(calc(new Date(t.getTime()-1).toISOString(),seoul).chart.year,'癸卯');
  assert.equal(calc(t.toISOString(),seoul).chart.year,'甲辰');
});
test('Seongnam mean solar hour flips within five civil minutes',()=>{
  const a=calc('1999-07-31T00:30:00Z',seongnam),b=calc('1999-07-31T00:35:00Z',seongnam);
  assert.deepEqual(a.chart,{year:'己卯',month:'辛未',day:'甲申',hour:'戊辰'});
  assert.deepEqual(b.chart,{year:'己卯',month:'辛未',day:'甲申',hour:'己巳'});
  assert.ok(Math.abs((solarClock(a.utc,seongnam.longitude).getUTCHours()*60+solarClock(a.utc,seongnam.longitude).getUTCMinutes())-538)<2);
});
test('term and solar Zi boundaries',()=>{
  assert.deepEqual(calc('2024-02-04T08:26:00Z',seoul).chart,{year:'癸卯',month:'乙丑',day:'戊戌',hour:'庚申'});
  assert.deepEqual(calc('2024-02-04T08:28:00Z',seoul).chart,{year:'甲辰',month:'丙寅',day:'戊戌',hour:'庚申'});
  assert.deepEqual(calc('2024-02-04T14:05:00Z',seoul).chart,{year:'甲辰',month:'丙寅',day:'戊戌',hour:'癸亥'});
  assert.deepEqual(calc('2024-02-04T14:35:00Z',seoul).chart,{year:'甲辰',month:'丙寅',day:'己亥',hour:'甲子'});
});
test('longitude shifts the same UTC instant by over eight minutes',()=>{
  const t=new Date('2024-02-04T14:30:00Z');
  const diff=(solarClock(t,sokcho.longitude).getTime()-solarClock(t,mokpo.longitude).getTime())/60_000;
  assert.ok(diff>8&&diff<9);
  assert.notEqual(occurrence(t,sokcho).chart.hour,occurrence(t,mokpo).chart.hour);
});
test('historical Korean daylight saving time and invalid local time',()=>{
  assert.equal(moment.tz('1987-07-31 09:30:00','YYYY-MM-DD HH:mm:ss','Asia/Seoul').utcOffset(),600);
  const m=moment.tz('1988-07-31 09:30:00','YYYY-MM-DD HH:mm:ss','Asia/Seoul');
  assert.equal(m.utcOffset(),600);
  assert.throws(()=>testCivilRoundtrip('1988-05-08 02:30:00'));
});
test('future 2039 and pinned timezone data are reproducible',()=>{
  assert.equal(moment.tz.dataVersion,'2026e');
  assert.deepEqual(calc('2039-07-31T00:30:00Z',seoul).chart,
    {year:'己未',month:'辛未',day:'甲寅',hour:'戊辰'});
});
test('day anchor, deterministic hash, and rule facts',()=>{
  assert.equal(calc('1999-12-31T15:00:00Z',seoul).chart.day,'戊午'); // solar time still 2000-01-01 before 23
  const a=calc('1999-07-31T00:30:00Z',seongnam);
  assert.equal(a.chartId,chartId(a.chart));
  assert.equal(tenGod('甲','辛'),'정관');
  assert.ok(extract(a.chart).some(x=>x.ruleId==='M022'));
});
