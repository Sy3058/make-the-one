import {z} from 'zod';
import ruleset from '../data/ruleset.json' with {type:'json'};
import type {Motif} from './rank';
const tags=[...new Set(ruleset.rules.flatMap(r=>r.motifs))].sort();
const motifSchema=z.object({tag:z.enum(tags as [string,...string[]]),importance:z.union([z.literal(1),z.literal(2),z.literal(3)]),
  quote:z.string().min(1).max(100),negative:z.boolean(),transition:z.boolean()});
const outputSchema=z.object({motifs:z.array(motifSchema).min(2).max(5)});
const jsonSchema={type:'object',additionalProperties:false,properties:{motifs:{type:'array',minItems:2,maxItems:5,
  items:{type:'object',additionalProperties:false,properties:{tag:{type:'string',enum:tags},importance:{type:'integer',enum:[1,2,3]},
    quote:{type:'string'},negative:{type:'boolean'},transition:{type:'boolean'}},
  required:['tag','importance','quote','negative','transition']}}},required:['motifs']};
export async function extractMotifs(story:string):Promise<Motif[]> {
  const key=process.env.MODEL_API_KEY;
  if(!key) throw new Error('MODEL_API_KEY unavailable');
  const models=['muse-spark-1.3',...(process.env.META_ALLOW_12==='1'?['muse-spark-1.2']:[])];
  for(const model of models){
    for(let attempt=0;attempt<2;attempt++){
      try {
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12_000);
        let response:Response;
        try {
          response=await fetch('https://api.meta.ai/v1/chat/completions',{method:'POST',signal:controller.signal,
            headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
            body:JSON.stringify({model,messages:[
              {role:'system',content:'한국어 이야기에서 명시된 주제만 2~5개 추출하라. quote는 원문에 있는 연속된 짧은 구절이어야 한다. 성격·운명·간지는 추측하지 마라.'},
              {role:'user',content:story}],response_format:{type:'json_schema',json_schema:{name:'story_motifs',schema:jsonSchema}}})});
        } finally {clearTimeout(timeout);}
        if(!response.ok) {
          if((response.status===429||response.status>=500)&&attempt===0) continue;
          throw new Error(`Meta HTTP ${response.status}`);
        }
        const data=await response.json() as {choices?:{message?:{content?:string}}[]};
        const parsed=outputSchema.parse(JSON.parse(data.choices?.[0]?.message?.content??''));
        if(new Set(parsed.motifs.map(m=>m.tag)).size!==parsed.motifs.length) throw new Error('duplicate motifs');
        if(parsed.motifs.some(m=>!story.includes(m.quote))) throw new Error('unsupported quote');
        return parsed.motifs;
      } catch(error){if(attempt===0&&error instanceof Error&&error.name==='AbortError') continue;
        if(model===models.at(-1)&&attempt===1) throw error;
        if(attempt===0) continue;
      }
    }
  }
  throw new Error('Meta extraction unavailable');
}
