import {z} from 'zod';
import associations from '../data/name-elements.json' with {type:'json'};
import corpus from '../data/names.json' with {type:'json'};
import {elements,type Element} from './elements';
const association=z.object({element:z.enum(elements).nullable(),gloss:z.string().min(1),source_url:z.url(),rationale:z.string().min(1)}).strict();
const schema=z.object({version:z.literal('ko-name-elements-v1'),method:z.literal('reviewed-meaning-materials'),policy:z.string().min(1),
  characters:z.record(z.string(),association.extend({source_sha256:z.string().regex(/^[a-f0-9]{64}$/)})),native_names:z.record(z.string(),association)}).strict();
export function validateElementAssociations(value:unknown=associations){
  const parsed=schema.parse(value);
  if(Object.keys(parsed.characters).length!==Object.keys(corpus.characters).length)throw new Error('Character association coverage differs');
  for(const [character,entry] of Object.entries(parsed.characters)){
    const fact=(corpus.characters as Record<string,{meaning_ko:string;source_url:string;evidence_sha256:string}>)[character];
    if(!fact||entry.gloss!==fact.meaning_ko||entry.source_url!==fact.source_url||entry.source_sha256!==fact.evidence_sha256)throw new Error('Character association evidence differs');
  }
  const natives=corpus.entries.filter(entry=>entry.name_kind==='native'&&entry.review_status==='verified');
  if(Object.keys(parsed.native_names).length!==natives.length)throw new Error('Native association coverage differs');
  for(const [name,entry] of Object.entries(parsed.native_names)){
    const fact=natives.find(n=>n.hangul===name);
    if(!fact||entry.gloss!==fact.word_meaning||entry.source_url!==fact.source_url)throw new Error('Native association evidence differs');
  }
  return parsed;
}
const checked=validateElementAssociations();
export const nameElementVersion=checked.version;
export function reviewedNameElements(name:{name_kind:'hanja'|'native';hangul:string;hanja:string|null}):(Element|null)[]{
  if(name.name_kind==='native')return [checked.native_names[name.hangul]?.element??null];
  return [...(name.hanja??'')].map(character=>checked.characters[character]?.element??null);
}
