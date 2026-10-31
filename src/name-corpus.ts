import {z} from 'zod';
import corpus from '../data/names.json' with {type:'json'};
import ruleset from '../data/ruleset.json' with {type:'json'};

const styles=['차분함','선명함','고전적','현대적','중립적'] as const;
const allowedMotifs=new Set(ruleset.rules.flatMap(r=>r.motifs));
const characterSchema=z.object({readings:z.array(z.string().regex(/^[가-힣]$/)).min(1),meaning_ko:z.string().min(1),
  court_allowed:z.literal(true),source_url:z.url(),checked_at:z.iso.date(),evidence_sha256:z.string().regex(/^[a-f0-9]{64}$/)});
const entrySchema=z.object({name_id:z.string().min(1),hangul:z.string().regex(/^[가-힣]{2}$/),hanja:z.string().length(2).nullable(),
  reading_verified:z.boolean(),meaning_ko:z.string().min(1),meaning_kind:z.enum(['creative_combination','creative_nickname']),
  motif_tags:z.array(z.string()).min(1),style_tags:z.array(z.enum(styles)).min(1),naturalness:z.number().int().min(1).max(5),
  is_playful:z.boolean(),review_status:z.enum(['draft','verified','rejected']),source_url:z.string().min(1),
  provenance_note:z.string().min(1),corpus_version:z.string().min(1)});
const schema=z.object({version:z.string().min(1),characters:z.record(z.string(),characterSchema),entries:z.array(entrySchema)});
export function validateNameCorpus(value:unknown=corpus){
  const parsed=schema.parse(value),ids=new Set<string>(),names=new Set<string>();
  for(const entry of parsed.entries){
    if(ids.has(entry.name_id)||names.has(entry.hangul)) throw new Error('Duplicate name ID or spelling');
    ids.add(entry.name_id);names.add(entry.hangul);
    if(entry.corpus_version!==parsed.version||entry.motif_tags.some(t=>!allowedMotifs.has(t))) throw new Error('Unknown name version or motif');
    if(entry.is_playful){
      if(entry.hanja!==null||entry.meaning_kind!=='creative_nickname') throw new Error('Playful names must remain separate creative nicknames');
    }else{
      if(!entry.hanja||!entry.reading_verified||entry.meaning_kind!=='creative_combination') throw new Error('Serious name lacks checked Hanja components');
      [...entry.hanja].forEach((character,index)=>{
        const fact=parsed.characters[character];
        if(!fact||!fact.readings.includes(entry.hangul[index])||new URL(fact.source_url).hostname!=='efamily.scourt.go.kr')
          throw new Error('Name reading or court source does not match checked characters');
      });
    }
  }
  const verified=parsed.entries.filter(n=>n.review_status==='verified');
  if(verified.filter(n=>!n.is_playful).length<72||verified.filter(n=>n.is_playful).length<12) throw new Error('Verified corpus requires at least 72 serious and 12 playful names');
  return {version:parsed.version,entries:verified};
}
