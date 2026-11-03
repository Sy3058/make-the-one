import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPillar,readPillarCharacter} from '../app/me/pillar-reading.ts';
import {ganzhi} from '../src/calendar.ts';

test('pillar stems and branches have Korean readings including easy-to-confuse glyphs',()=>{
  assert.equal(readPillar('甲辰'),'갑진');
  assert.equal(readPillar('己巳'),'기사');
  assert.equal(readPillar('戊戌'),'무술');
  assert.equal(readPillar('辛丑'),'신축');
  assert.equal(readPillar('癸亥'),'계해');
  for(let index=0;index<60;index++)assert.match(readPillar(ganzhi(index)),/^[가-힣]{2}$/);
});
test('unknown pillar text is rejected instead of receiving an invented reading',()=>{
  assert.throws(()=>readPillar('甲'),/pair/);
  assert.throws(()=>readPillar('AB'),/Unknown/);
  assert.throws(()=>readPillarCharacter('constructor'),/Unknown/);
});
