import type {ExperienceMode} from './experience-copy';
export type UiEvent='visit'|'card_download'|'share_click'|'text_copy'|'name_preference';
export function trackEvent(mode:ExperienceMode,event:UiEvent,rank?:number){
  void fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode,event,...(rank===undefined?{}:{rank})}),keepalive:true}).catch(()=>{});
}
