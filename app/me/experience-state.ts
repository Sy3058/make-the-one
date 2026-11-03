type Name = {name:string;hanja:string|null;kind:'hanja'|'native';meaning:string;wordMeaning:string|null;sourceUrl:string};
type Interpretation = {kind:'chart';sections:{id:string;title:string;paragraphs:string[]}[];basis:{label:string;text:string}[]};
export type Recommendation = {
  chartId:string;
  fictionalBirth: {city: string; civilTime: string; utcOffsetMinutes: number};
  pillars: [string, string, string, string];
  name: Name;
  interpretation: Interpretation;
};

export function isRecommendation(value: unknown): value is Recommendation {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Recommendation>;
  const bounded=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
  const validName = (value:unknown):value is Name=>{
    if(!value||typeof value!=='object')return false;
    const n=value as Partial<Name>;
    if(!bounded(n.name,2)||!/^[가-힣]{2}$/.test(n.name)||!bounded(n.meaning,1500)||!bounded(n.sourceUrl,500))return false;
    try{if(new URL(n.sourceUrl).protocol!=='https:')return false;}catch{return false;}
    return n.kind==='hanja'?typeof n.hanja==='string'&&/^[\p{Script=Han}]{2}$/u.test(n.hanja)&&n.wordMeaning===null:
      n.kind==='native'&&n.hanja===null&&bounded(n.wordMeaning,300);
  };
  const textArray = (value:unknown,min:number,max:number,length:number):value is string[] => Array.isArray(value)&&
    value.length>=min&&value.length<=max&&value.every(item=>typeof item==='string'&&item.length>0&&item.length<=length);
  const interpretation=data.interpretation;
  return typeof data.chartId==='string'&&/^[a-f0-9]{64}$/.test(data.chartId)&&!!data.fictionalBirth &&
    typeof data.fictionalBirth.city === 'string' &&
    typeof data.fictionalBirth.civilTime === 'string' && /^(?:198\d|199\d|20[0-3]\d)-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data.fictionalBirth.civilTime) &&
    Number.isInteger(data.fictionalBirth.utcOffsetMinutes) && Math.abs(data.fictionalBirth.utcOffsetMinutes) <= 14 * 60 &&
    Array.isArray(data.pillars) && data.pillars.length === 4 &&
    data.pillars.every(pillar => typeof pillar === 'string' && /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(pillar)) &&
    validName(data.name) && !!interpretation && typeof interpretation==='object' &&
    interpretation.kind==='chart' && Array.isArray(interpretation.sections) && interpretation.sections.length===4 &&
    interpretation.sections.every((section,index)=>!!section && typeof section==='object' &&
      section.id===['character','work','money','relationships'][index] &&
      typeof section.title==='string' && section.title.length>0 && section.title.length<=50 &&
      textArray(section.paragraphs,1,4,1500)) &&
    Array.isArray(interpretation.basis) && interpretation.basis.length>=1 && interpretation.basis.length<=8 &&
    interpretation.basis.every(fact=>!!fact && typeof fact==='object' && typeof fact.label==='string' &&
      fact.label.length>0 && fact.label.length<=50 && typeof fact.text==='string' && fact.text.length>0 && fact.text.length<=1500);
}

export type Result={recommendations:[Recommendation,Recommendation,Recommendation]};
export function isResult(value:unknown):value is Result{
  if(!value||typeof value!=='object'||!('recommendations' in value))return false;
  const items=value.recommendations;
  return Array.isArray(items)&&items.length===3&&items.every(isRecommendation)&&
    new Set(items.map(item=>item.chartId)).size===3&&new Set(items.map(item=>item.pillars.join(''))).size===3&&
    new Set(items.map(item=>item.name.name)).size===3;
}

export type Status = 'idle' | 'loading' | 'falling' | 'ready';
type State = {story: string; status: Status; result: Result | null; error: string};
type Action =
  | {type: 'edit'; story: string}
  | {type: 'start'}
  | {type: 'success'; result: Result}
  | {type: 'complete'}
  | {type: 'error'; message: string}
  | {type: 'reset'};

export const initialState: State = {story: '', status: 'idle', result: null, error: ''};

export function experienceReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'edit':
      return state.status === 'idle' ? {...state, story: action.story} : state;
    case 'start':
      if (state.status !== 'idle') return state;
      if (state.story.trim().length < 30 || state.story.trim().length > 1200) {
        return {...state, error: '이야기를 30~1200자로 적어주세요.'};
      }
      return {...state, status: 'loading', result: null, error: ''};
    case 'success':
      return state.status === 'loading' ? {...state, status: 'falling', result: action.result} : state;
    case 'complete':
      return state.status === 'falling' ? {...state, status: 'ready'} : state;
    case 'error':
      return state.status === 'loading' ? {...state, status: 'idle', error: action.message} : state;
    case 'reset':
      return state.status === 'ready' ? {...initialState, story: state.story} : state;
  }
}
