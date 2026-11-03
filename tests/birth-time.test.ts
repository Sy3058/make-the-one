import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatCivilBirth} from '../app/me/birth-time.ts';
import {occurrence} from '../src/calendar.ts';
import places from '../data/places.json' with {type:'json'};

test('repeated 1988 Seoul civil times stay distinct by their stored UTC offset',()=>{
  const seoul=places.find(place=>place.id==='seoul')!;
  const first=occurrence(new Date('1988-10-08T16:15:00Z'),seoul);
  const second=occurrence(new Date('1988-10-08T17:15:00Z'),seoul);
  assert.equal(first.civil,second.civil);
  assert.notEqual(first.chart.hour,second.chart.hour);
  const format=(row:typeof first)=>formatCivilBirth({city:row.place.id,civilTime:row.civil,utcOffsetMinutes:row.utcOffsetMin});
  assert.equal(format(first),'1988-10-09 02:15 (UTC+10:00)');
  assert.equal(format(second),'1988-10-09 02:15 (UTC+09:00)');
});

test('birth formatting preserves the supplied civil clock and includes minute offsets',()=>{
  assert.equal(formatCivilBirth({city:'seoul',civilTime:'2024-02-15 14:32:05',utcOffsetMinutes:540}),
    '2024-02-15 14:32 (UTC+09:00)');
  assert.equal(formatCivilBirth({city:'example',civilTime:'2024-02-15T14:32:05',utcOffsetMinutes:-210}),
    '2024-02-15 14:32 (UTC-03:30)');
});
