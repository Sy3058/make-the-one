import ruleset from '../data/ruleset.json' with {type:'json'};
import {ganzhi,STEMS,type Chart} from './ganzhi';
import {extract,hidden,tenGod} from './features';

export type Interpretation={kind:'chart';paragraphs:string[];references:{ruleId:string;feature:string}[]};
const validPillars=new Set(Array.from({length:60},(_,index)=>ganzhi(index)));
const stemReadings=['갑','을','병','정','무','기','경','신','임','계'];
const elements=['목(木)','화(火)','토(土)','금(金)','수(水)'];
const dayThemes=[
  '성장할 방향을 세우고 자신의 영역을 넓혀가는 이미지가 기본에 놓입니다. 속도를 내는 것과 뿌리를 내리는 것의 균형을 살펴보는 원국입니다.',
  '안에 있는 것을 밖으로 드러내고 온기와 움직임을 만드는 이미지가 기본에 놓입니다. 무엇에 힘을 쏟고 어떤 방식으로 표현하는지를 중심으로 읽습니다.',
  '여러 기운을 받아들이고 한곳에 모아 기반을 만드는 이미지가 기본에 놓입니다. 변화를 받아들이면서도 자기 자리를 유지하는 방식이 중요한 주제가 됩니다.',
  '대상을 구분하고 기준을 세워 필요한 것을 남기는 이미지가 기본에 놓입니다. 정돈하고 다듬는 힘을 어디에 사용하는지를 중심으로 읽습니다.',
  '상황을 관찰하고 흐름에 맞춰 길을 찾는 이미지가 기본에 놓입니다. 한 가지 방식에 고정되기보다 방향을 바꾸고 연결하는 움직임을 살펴봅니다.',
];
const groupReadings=[
  {name:'비겁',gods:['비견','겁재'],text:'자기 기준을 세우는 힘과 다른 사람과 나란히 서는 문제가 함께 드러납니다. 주도권과 협력 사이에서 자신의 몫을 어떻게 정하는지를 중심으로 읽을 수 있습니다.'},
  {name:'식상',gods:['식신','상관'],text:'안의 생각이나 능력을 밖으로 만들어 내는 흐름이 눈에 띕니다. 표현과 제작, 꾸준히 결과물을 쌓아 가는 방식이 원국의 주요한 주제가 됩니다.'},
  {name:'재성',gods:['편재','정재'],text:'기회를 실제 결과로 바꾸고 자원을 다루는 흐름이 눈에 띕니다. 무엇을 얻을지뿐 아니라 이미 가진 것을 관리하고 이어 가는 방식도 함께 살펴봅니다.'},
  {name:'관성',gods:['칠살','정관'],text:'맡은 역할과 외부의 요구에 대응하는 흐름이 눈에 띕니다. 책임을 받아들이는 방식, 압박 속에서 결정을 내리고 기준을 유지하는 문제가 주요한 주제가 됩니다.'},
  {name:'인성',gods:['편인','정인'],text:'받아들이고 이해하며 자기 안에 바탕을 만드는 흐름이 눈에 띕니다. 배운 것을 정리하는 방식과 자신을 받쳐 주는 환경·관계의 역할을 함께 읽을 수 있습니다.'},
];

export function interpretChart(chart:Chart):Interpretation{
  const pillars=[chart.year,chart.month,chart.day,chart.hour];
  if(pillars.some(pillar=>!validPillars.has(pillar)))throw new Error('Invalid chart for interpretation');
  const features=extract(chart).filter(feature=>feature.priority>=2&&feature.family!=='신살·운성');
  const has=(id:string)=>features.some(feature=>feature.ruleId===id);
  const dayStem=chart.day[0],element=Math.floor(STEMS.indexOf(dayStem)/2);
  const paragraphs=[`이 사주의 중심인 일간은 ${dayStem}(${stemReadings[STEMS.indexOf(dayStem)]})이며 ${elements[element]}에 속합니다. ${dayThemes[element]}`];
  const season=features.find(feature=>['M011','M012','M013','M014','M015'].includes(feature.ruleId));
  if(season){
    const rule=ruleset.rules.find(rule=>rule.id===season.ruleId)!;
    paragraphs.push(`태어난 계절의 바탕을 나타내는 월지는 ${chart.month[1]}입니다. 이 원국에는 ‘${rule.feature}’의 조건이 있으며, ‘${rule.copy}’라는 계절의 이미지가 일간의 기본 성향과 함께 놓여 있습니다.`);
  }
  const gods=[...pillars.flatMap((pillar,index)=>index===2?[]:[tenGod(dayStem,pillar[0])]),
    ...pillars.map(pillar=>tenGod(dayStem,hidden[pillar[1]][0]))];
  const groups=groupReadings.map(group=>({...group,count:gods.filter(god=>group.gods.includes(god)).length})).sort((a,b)=>b.count-a.count);
  const top=groups.filter(group=>group.count===groups[0].count).slice(0,2);
  paragraphs.push(`일간을 제외한 천간과 네 지지의 중심 기운(본기)을 일간과 비교하면 ${top.map(group=>`${group.name}(${group.count}곳)`).join(', ')}의 관계가 두드러집니다. ${top.map(group=>group.text).join(' ')}`);
  if(has('M022')){
    paragraphs.push(`지지의 지장간 가운데 일간과 같은 오행이 있어 뿌리를 두는 통근 표지가 확인됩니다. ${has('M021')?'월지 속 지장간이 천간에도 드러나는 투출 표지도 있어, 안쪽의 바탕과 밖으로 드러나는 기운의 연결을 함께 살펴볼 수 있습니다.':'바깥으로 드러난 모습과 그 아래에서 받쳐 주는 기반을 함께 읽는 부분입니다.'} 이 표지만으로 일간의 강약이나 용신을 확정하지는 않습니다.`);
  }else{
    paragraphs.push('지지의 지장간에는 일간과 같은 오행의 뿌리가 확인되지 않습니다. 이 원국은 일간만 따로 보기보다 다른 기운과 어떤 관계를 맺는지를 함께 살펴야 합니다. 뿌리의 유무만으로 약한 사주라고 판정하는 것은 아닙니다.');
  }
  const joins=features.filter(feature=>['M023','M024','M025','M026'].includes(feature.ruleId));
  const tensions=features.filter(feature=>['M027','M028','M029','M030'].includes(feature.ruleId));
  if(joins.length||tensions.length){
    const facts=[joins.length?`서로 결합하는 ${joins.map(feature=>ruleset.rules.find(rule=>rule.id===feature.ruleId)!.feature).join('·')} 표지`:null,
      tensions.length?`차이와 긴장을 만드는 ${tensions.map(feature=>ruleset.rules.find(rule=>rule.id===feature.ruleId)!.feature).join('·')} 표지`:null].filter(Boolean).join('와 ');
    paragraphs.push(`기둥 사이에서는 ${facts}가 확인됩니다. ${joins.length&&tensions.length?'합쳐지는 방향과 서로 다른 방향으로 움직이려는 힘이 함께 있어, 조율과 변화가 동시에 나타나는 구성으로 읽습니다.':joins.length?'서로 다른 기운이 연결되는 지점이 있으므로, 개별 글자뿐 아니라 함께 묶여 작용하는 관계를 살펴보는 구성입니다.':'서로 다른 방향의 기운이 만나는 지점이 있어, 변화와 조정이 필요한 관계를 중심으로 읽는 구성입니다.'}`);
  }
  const usedIds=new Set([`M${String(16+element).padStart(3,'0')}`,season?.ruleId,
    ...features.filter(feature=>feature.ruleId>='M001'&&feature.ruleId<='M010').map(feature=>feature.ruleId),
    ...features.filter(feature=>['M021','M022','M023','M024','M025','M026','M027','M028','M029','M030'].includes(feature.ruleId)).map(feature=>feature.ruleId)]);
  const references=features.filter(feature=>usedIds.has(feature.ruleId)).map(feature=>({ruleId:feature.ruleId,feature:ruleset.rules.find(rule=>rule.id===feature.ruleId)!.feature}));
  return {kind:'chart',paragraphs,references};
}
