import {BRANCHES, STEMS, type Chart} from './calendar.js';
import ruleset from '../data/ruleset.json' with {type:'json'};

const element=(stem:string)=>Math.floor(STEMS.indexOf(stem)/2);
const branchElement:Record<string,number>={子:4,丑:2,寅:0,卯:0,辰:2,巳:1,午:1,未:2,申:3,酉:3,戌:2,亥:4};
export const hidden:Record<string,string[]>={子:['癸'],丑:['己','癸','辛'],寅:['甲','丙','戊'],卯:['乙'],
  辰:['戊','乙','癸'],巳:['丙','戊','庚'],午:['丁','己'],未:['己','丁','乙'],
  申:['庚','壬','戊'],酉:['辛'],戌:['戊','辛','丁'],亥:['壬','甲']};
const includesPair=(arr:string[],a:string,b:string)=>arr.includes(a)&&arr.includes(b);
const pairList=(arr:string[],pairs:string[])=>pairs.filter(p=>includesPair(arr,p[0],p[1]));
const stemComb=['甲己','乙庚','丙辛','丁壬','戊癸'];
const branchComb=['子丑','寅亥','卯戌','辰酉','巳申','午未'];
const clash=['子午','丑未','寅申','卯酉','辰戌','巳亥'];
const harm=['子未','丑午','寅巳','卯辰','申亥','酉戌'];
const broken=['子酉','丑辰','寅亥','卯午','巳申','未戌'];
const trines=['申子辰','亥卯未','寅午戌','巳酉丑'];
const stars:Record<string,string>={申:'寅酉辰',子:'寅酉辰',辰:'寅酉辰',
  寅:'申卯戌',午:'申卯戌',戌:'申卯戌',亥:'巳子未',卯:'巳子未',未:'巳子未',
  巳:'亥午丑',酉:'亥午丑',丑:'亥午丑'};
const noble:Record<string,string>={甲:'丑未',戊:'丑未',庚:'丑未',乙:'子申',己:'子申',
  丙:'亥酉',丁:'亥酉',壬:'卯巳',癸:'卯巳',辛:'寅午'};
const godNames=['비견','겁재','식신','상관','편재','정재','칠살','정관','편인','정인'];
export function tenGod(day:string,other:string) {
  const relation=(((element(other)-element(day))%5)+5)%5;
  const category=relation; // self, output, wealth, officer, resource
  const parity=(STEMS.indexOf(day)-STEMS.indexOf(other)+10)%2;
  return godNames[category*2+parity];
}
export type Feature={ruleId:string;family:string;motifs:string[];priority:number;
  evidence:{positions:string[]; detail:string};source:string};
export function extract(chart:Chart):Feature[] {
  const pillars=[chart.year,chart.month,chart.day,chart.hour];
  const stems=pillars.map(p=>p[0]), branches=pillars.map(p=>p[1]);
  const dayStem=stems[2];
  const principalGods=branches.map(b=>tenGod(dayStem,hidden[b][0]));
  const visibleGods=stems.flatMap((s,i)=>i===2?[]:[tenGod(dayStem,s)]);
  const allGods=[...visibleGods,...principalGods];
  const pairs=pairList(stems,stemComb), joins=pairList(branches,branchComb);
  const clashes=pairList(branches,clash), harms=pairList(branches,harm), breaks=pairList(branches,broken);
  const full=trines.filter(t=>[...t].every(b=>branches.includes(b)));
  const partial=trines.filter(t=>[...t].filter(b=>branches.includes(b)).length===2&&!full.includes(t));
  const root=branches.some(b=>hidden[b].some(s=>element(s)===element(dayStem)));
  const exposed=hidden[branches[1]].some(s=>stems.includes(s));
  const horse=(base:string)=>branches.includes(stars[base][0]);
  const peach=(base:string)=>branches.includes(stars[base][1]);
  const canopy=(base:string)=>branches.includes(stars[base][2]);
  const punishment=includesPair(branches,'子','卯') || ['寅巳申','丑戌未'].some(t=>[...t].every(b=>branches.includes(b))) ||
    ['辰','午','酉','亥'].some(b=>branches.filter(x=>x===b).length>=2);
  const positives:Record<string,boolean>={
    M011:'寅卯'.includes(branches[1]),M012:'巳午'.includes(branches[1]),
    M013:'申酉'.includes(branches[1]),M014:'亥子'.includes(branches[1]),
    M015:'辰未戌丑'.includes(branches[1]),
    M016:'甲乙'.includes(dayStem),M017:'丙丁'.includes(dayStem),M018:'戊己'.includes(dayStem),
    M019:'庚辛'.includes(dayStem),M020:'壬癸'.includes(dayStem),
    M021:exposed,M022:root,M023:pairs.length>0,M024:joins.length>0,
    M025:full.length>0,M026:partial.length>0,M027:clashes.length>0,M028:punishment,
    M029:harms.length>0,M030:breaks.length>0,M031:horse(branches[0]),
    M032:horse(branches[2]),M033:peach(branches[0]),M034:peach(branches[2]),
    M035:canopy(branches[0]),M036:canopy(branches[2]),
    M037:[...noble[dayStem]].some(b=>branches.includes(b)),
    M038:false,M039:false,M040:false,
    M041:visibleGods.includes('정관')&&visibleGods.includes('정인'),
    M042:visibleGods.includes('식신')&&visibleGods.includes('편재'),
    M043:visibleGods.includes('상관')&&visibleGods.includes('정관'),
    M044:visibleGods.includes('칠살')&&visibleGods.includes('식신'),
    M045:visibleGods.includes('편인')&&visibleGods.includes('식신'),
    M046:clashes.length>0&&(pairs.length>0||joins.length>0||full.length>0),
    M047:root&&exposed,
    M048:(horse(branches[0])||horse(branches[2]))&&(canopy(branches[0])||canopy(branches[2]))
  };
  const result:Feature[]=[];
  for(const rule of ruleset.rules) {
    const id=rule.id;
    const applies=id>='M001'&&id<='M010'?allGods.includes(godNames[Number(id.slice(1))-1]):positives[id];
    if(!applies) continue;
    result.push({ruleId:id,family:rule.family,motifs:rule.motifs,priority:rule.priority,
      evidence:{positions:['year','month','day','hour'],detail:JSON.stringify({stems,branches,pairs,joins,clashes,full,partial,root,exposed})},
      source:ruleset.sourceUrl});
  }
  return result;
}
