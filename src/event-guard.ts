import {AdmissionError} from './generation-guard';
export const eventLimits={perMinute:30,globalPerMinute:300,maxInFlight:2} as const;
export type EventLimits={perMinute:number;globalPerMinute:number;maxInFlight:number};
// Reject excess work before acquiring a DB connection. Shared DB counters also cover multiple workers.
export function createEventGate(limits:EventLimits=eventLimits,now=Date.now){
  let minute=-1,total=0,inFlight=0;
  const clients=new Map<string,number>();
  return {enter(hash:string){
    const current=Math.floor(now()/60_000);
    if(current!==minute){minute=current;total=0;clients.clear();}
    if(inFlight>=limits.maxInFlight)throw new AdmissionError(429,'EVENT_BUSY',1);
    const used=clients.get(hash)??0;
    if(total>=limits.globalPerMinute||used>=limits.perMinute)throw new AdmissionError(429,'EVENT_RATE_LIMIT',60);
    total++;clients.set(hash,used+1);inFlight++;
    let released=false;
    return ()=>{if(!released){released=true;inFlight--;}};
  }};
}
