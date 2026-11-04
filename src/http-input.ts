export class InputError extends Error{
  constructor(readonly status:number,message:string){super(message);}
}
export function checkOrigin(request:Request){
  const configured=process.env.APP_ORIGIN;
  if(process.env.NODE_ENV==='production'&&!configured)throw new InputError(503,'서비스 주소를 준비하지 못했어요.');
  let allowed:string;
  try{
    const base=new URL(request.url),host=request.headers.get('host');
    const canonical=new URL(configured||`${base.protocol}//${host||base.host}`);
    if(!['http:','https:'].includes(canonical.protocol)||canonical.username||canonical.password||canonical.pathname!=='/'||canonical.search||canonical.hash||
      (process.env.NODE_ENV==='production'&&canonical.protocol!=='https:'))throw new Error('Invalid origin');
    allowed=canonical.origin;
  }catch{throw new InputError(503,'서비스 주소를 준비하지 못했어요.');}
  const origin=request.headers.get('origin');
  if(origin&&origin!==allowed)throw new InputError(403,'요청한 페이지를 확인해 주세요.');
}
export async function readJson(request:Request,maxBytes=16_384,timeoutMs=5000):Promise<unknown>{
  checkOrigin(request);
  if(request.headers.get('content-type')?.toLowerCase().split(';')[0].trim()!=='application/json')throw new InputError(415,'JSON 형식으로 요청해 주세요.');
  const declared=request.headers.get('content-length');
  if(declared&&Number(declared)>maxBytes)throw new InputError(413,'입력 내용이 너무 깁니다.');
  const reader=request.body?.getReader();if(!reader)throw new InputError(400,'입력 내용을 확인해 주세요.');
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const work=(async()=>{
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
      if(size>maxBytes)throw new InputError(413,'입력 내용이 너무 깁니다.');chunks.push(next.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new InputError(400,'입력 내용을 확인해 주세요.');}
  })();
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new InputError(408,'입력 전송이 늦어지고 있어요. 다시 시도해 주세요.')),timeoutMs);})]);}
  finally{clearTimeout(timeout);void reader.cancel().catch(()=>{});}
}
