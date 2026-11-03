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

type MetaErrorCode='MODEL_TIMEOUT'|'MODEL_UNAVAILABLE'|'MODEL_RESPONSE_INVALID';
const messages:Record<MetaErrorCode,string>={
  MODEL_TIMEOUT:'이야기를 읽는 데 시간이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.',
  MODEL_UNAVAILABLE:'이야기를 읽는 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
  MODEL_RESPONSE_INVALID:'이야기의 단서를 정리하지 못했어요. 이야기를 조금 더 구체적으로 적거나 다시 시도해 주세요.',
};
export class MetaServiceError extends Error {
  constructor(readonly code:MetaErrorCode,readonly upstreamStatus?:number){
    super(messages[code]);this.name='MetaServiceError';
  }
}
const defaultLimits={attemptTimeoutMs:20_000,totalTimeoutMs:40_000};
const safeTokenCount=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:undefined;

export async function extractMotifs(story:string,limits=defaultLimits):Promise<Motif[]> {
  const key=process.env.MODEL_API_KEY;
  if(!key) throw new MetaServiceError('MODEL_UNAVAILABLE');
  const models=['muse-spark-1.3',...(process.env.META_ALLOW_12==='1'?['muse-spark-1.2']:[])];
  const deadline=Date.now()+limits.totalTimeoutMs;
  let failure=new MetaServiceError('MODEL_UNAVAILABLE');
  for(const model of models){
    for(let attempt=0;attempt<2;attempt++){
      const remaining=deadline-Date.now();
      if(remaining<=0) throw new MetaServiceError('MODEL_TIMEOUT');
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),Math.min(limits.attemptTimeoutMs,remaining));
      const started=performance.now();
      let phase:'headers'|'body'|'validation'='headers';
      let headersMs:number|undefined,bodyMs:number|undefined,completionTokens:number|undefined,reasoningTokens:number|undefined;
      let outcome:MetaErrorCode|'ok'='MODEL_UNAVAILABLE';
      try {
        const response=await fetch('https://api.meta.ai/v1/chat/completions',{method:'POST',signal:controller.signal,
          headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
          body:JSON.stringify({model,reasoning_effort:'minimal',max_completion_tokens:2048,messages:[
            {role:'system',content:'한국어 이야기에서 명시된 주제만 2~5개 추출하라. quote는 원문에 있는 연속된 짧은 구절이어야 한다. 성격·운명·간지는 추측하지 마라.'},
            {role:'user',content:story}],response_format:{type:'json_schema',json_schema:{name:'story_motifs',schema:jsonSchema}}})});
        headersMs=Math.round(performance.now()-started);
        if(!response.ok) throw new MetaServiceError('MODEL_UNAVAILABLE',response.status);
        phase='body';
        const bodyStarted=performance.now();
        const responseText=await response.text();
        bodyMs=Math.round(performance.now()-bodyStarted);
        phase='validation';
        try {
          const data=JSON.parse(responseText) as {choices?:{message?:{content?:string}}[];
            usage?:{completion_tokens?:unknown;completion_tokens_details?:{reasoning_tokens?:unknown}}};
          completionTokens=safeTokenCount(data.usage?.completion_tokens);
          reasoningTokens=safeTokenCount(data.usage?.completion_tokens_details?.reasoning_tokens);
          const parsed=outputSchema.parse(JSON.parse(data.choices?.[0]?.message?.content??''));
          if(new Set(parsed.motifs.map(m=>m.tag)).size!==parsed.motifs.length) throw new MetaServiceError('MODEL_RESPONSE_INVALID');
          if(parsed.motifs.some(m=>!story.includes(m.quote))) throw new MetaServiceError('MODEL_RESPONSE_INVALID');
          outcome='ok';
          return parsed.motifs;
        }catch(error){
          if(controller.signal.aborted) throw error;
          throw new MetaServiceError('MODEL_RESPONSE_INVALID');
        }
      }catch(error){
        failure=controller.signal.aborted ? new MetaServiceError('MODEL_TIMEOUT')
          :error instanceof MetaServiceError ? error :new MetaServiceError('MODEL_UNAVAILABLE');
        outcome=failure.code;
      }finally{
        clearTimeout(timeout);
        console.info('model attempt timing',{model,attempt:attempt+1,phase,outcome,headersMs,bodyMs,
          elapsedMs:Math.round(performance.now()-started),completionTokens,reasoningTokens});
      }
    }
  }
  throw failure;
}
