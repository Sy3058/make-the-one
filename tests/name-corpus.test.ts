import {test} from 'node:test';
import assert from 'node:assert/strict';
import corpus from '../data/names.json' with {type:'json'};
import {validateNameCorpus} from '../src/name-corpus.ts';

test('source-checked corpus has 72 serious names and 12 separate authored nicknames',()=>{
  const result=validateNameCorpus();
  assert.equal(result.entries.filter(n=>!n.is_playful).length,72);
  assert.equal(result.entries.filter(n=>n.is_playful).length,12);
});
test('wrong Hanja reading and unverified court characters prevent loading',()=>{
  const wrong=structuredClone(corpus);wrong.entries[0].hangul='겨윤';
  assert.throws(()=>validateNameCorpus(wrong),/reading/);
  const unverified=structuredClone(corpus);Object.values(unverified.characters)[0].court_allowed=false;
  assert.throws(()=>validateNameCorpus(unverified));
});
test('draft names, duplicate names and unknown creative motif tags do not silently pass',()=>{
  const draft=structuredClone(corpus);draft.entries[0].review_status='draft';
  assert.throws(()=>validateNameCorpus(draft),/72 serious/);
  const duplicate=structuredClone(corpus);duplicate.entries[1].hangul=duplicate.entries[0].hangul;
  assert.throws(()=>validateNameCorpus(duplicate),/Duplicate/);
  const unknown=structuredClone(corpus);unknown.entries[0].motif_tags.push('unreviewed-tag');
  assert.throws(()=>validateNameCorpus(unknown),/Unknown/);
});
