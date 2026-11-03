type Name = {name: string; meaning: string};
type Interpretation = {kind:'chart';paragraphs:string[]};
export type Result = {
  fictionalBirth: {city: string; civilTime: string; utcOffsetMinutes: number};
  pillars: [string, string, string, string];
  seriousNames: Name[];
  interpretation: Interpretation;
};

export function isResult(value: unknown): value is Result {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Result>;
  const validName = (name: unknown): name is Name =>
    !!name && typeof name === 'object' &&
    typeof (name as Name).name === 'string' && typeof (name as Name).meaning === 'string';
  const textArray = (value:unknown,min:number,max:number,length:number):value is string[] => Array.isArray(value)&&
    value.length>=min&&value.length<=max&&value.every(item=>typeof item==='string'&&item.length>0&&item.length<=length);
  const interpretation=data.interpretation;
  return !!data.fictionalBirth &&
    typeof data.fictionalBirth.city === 'string' &&
    typeof data.fictionalBirth.civilTime === 'string' &&
    Number.isInteger(data.fictionalBirth.utcOffsetMinutes) && Math.abs(data.fictionalBirth.utcOffsetMinutes) <= 14 * 60 &&
    Array.isArray(data.pillars) && data.pillars.length === 4 &&
    data.pillars.every(pillar => typeof pillar === 'string' && /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(pillar)) &&
    Array.isArray(data.seriousNames) && data.seriousNames.length === 3 &&
    data.seriousNames.every(validName) && !!interpretation && typeof interpretation==='object' &&
    interpretation.kind==='chart' && textArray(interpretation.paragraphs,1,6,1500);
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
