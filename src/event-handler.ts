import {NextResponse} from 'next/server';
import {checkOrigin,readJson,InputError} from './http-input';
import {guardConfig,clientIdentity,AdmissionError} from './generation-guard';
import {uiEventSchema,recordUiEvent} from './analytics';
import {createEventGate} from './event-guard';
type Dependencies={gate:ReturnType<typeof createEventGate>;write:typeof recordUiEvent};
export function createEventHandler(dependencies:Partial<Dependencies>={}){
  const gate=dependencies.gate??createEventGate(),write=dependencies.write??recordUiEvent;
  return async function POST(request:Request){
    let release:(()=>void)|undefined,cookie:string|undefined;
    const reply=(status:number,error?:string,retryAfter?:number)=>{
      const headers:Record<string,string>={'Cache-Control':'no-store'};
      if(cookie)headers['Set-Cookie']=cookie;
      if(retryAfter)headers['Retry-After']=String(retryAfter);
      return status===204?new Response(null,{status,headers}):NextResponse.json({error},{status,headers});
    };
    try{
      checkOrigin(request);
      const config=guardConfig(),identity=clientIdentity(request,config.secret,config);cookie=identity.cookie;
      release=gate.enter(identity.hash);
      const result=uiEventSchema.safeParse(await readJson(request,1024,1000));
      if(!result.success)return reply(400,'요청 내용을 확인해 주세요.');
      await write(identity.hash,result.data);
      return reply(204);
    }catch(error){
      if(error instanceof InputError)return reply(error.status,error.message);
      if(error instanceof AdmissionError)return reply(error.status,error.message,error.retryAfter);
      return reply(503,'이벤트를 기록하지 못했어요.');
    }finally{release?.();}
  };
}
