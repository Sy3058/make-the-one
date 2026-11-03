import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generationInput,yearRangeSchema} from '../src/generation-input.ts';
import {POST} from '../app/api/generate/route.ts';
const story='가상의 인물은 마을에서 책을 읽고 이웃을 돌보며 새로운 기술을 배우고 자신의 생각을 글로 표현했다.';
test('decades and custom ranges use inclusive civil years within the supported policy',()=>{
  for(const range of [{from:1980,to:1989},{from:1990,to:1999},{from:1985,to:1995},{from:2024,to:2024},{from:1980,to:2039}])
    assert.deepEqual(generationInput.parse({mode:'me',story,nameFeel:'masculine',yearRange:range}).yearRange,range);
  assert.equal(generationInput.parse({mode:'me',story}).nameFeel,'any');
  assert.equal(generationInput.parse({mode:'me',story}).yearRange,undefined);
  for(const range of [{from:1979,to:1989},{from:1999,to:1990},{from:1980,to:2040},{from:1980.5,to:1990},{from:'1980',to:1990},{from:1980}])
    assert.equal(yearRangeSchema.safeParse(range).success,false);
});
test('invalid preferences and ranges are rejected before any model request',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('must not call');});
  t.mock.method(console,'info',()=>{});
  for(const options of [{nameFeel:'unknown'},{yearRange:{from:1999,to:1990}},{yearRange:{from:1980,to:2040}},{story:' '.repeat(40)}]){
    const response=await POST(new Request('http://localhost/api/generate',{method:'POST',body:JSON.stringify({mode:'me',story,...options})}));
    assert.equal(response.status,400);
  }
  assert.equal(calls,0);
});
