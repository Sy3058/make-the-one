import ruleset from '../data/ruleset.json' with {type:'json'};
import {ganzhi,STEMS,type Chart} from './ganzhi';
import {extract,hidden,tenGod} from './features';

export type ReadingSection={id:string;title:string;paragraphs:string[];ruleIds:string[]};
export type Interpretation={kind:'chart';sections:ReadingSection[];basis:{label:string;text:string}[];
  references:{ruleId:string;feature:string}[]};
const validPillars=new Set(Array.from({length:60},(_,index)=>ganzhi(index)));
const stemReadings=['갑','을','병','정','무','기','경','신','임','계'];
const elements=['목(木)','화(火)','토(土)','금(金)','수(水)'];
// Project-authored symbolic readings, not quotations or predictions of actual events.
const dayThemes=[
  '스스로 방향을 정하고 조금씩 성장해 가는 성향입니다. 당장 눈에 띄는 결과보다 오래 이어갈 수 있는 일을 만났을 때 끈기가 살아납니다.',
  '생각과 감정을 밖으로 표현하고 주변에 활기를 더하는 성향입니다. 관심이 생기면 적극적으로 움직이지만, 의욕이 앞서 자기 힘을 한꺼번에 쏟아붓지 않도록 쉬는 시간도 필요합니다.',
  '자기 자리를 지키고 맡은 일을 끝까지 이어가는 성향입니다. 주변을 받아주는 여유가 장점이지만, 익숙한 방식을 고집하면 변화를 받아들이는 데 시간이 걸립니다.',
  '좋고 싫음과 해야 할 일을 분명하게 구분하는 성향입니다. 흐트러진 것을 정리하고 완성도를 높이는 데 강점이 있지만, 자신과 남에게 같은 수준을 요구하면 피로가 쌓입니다.',
  '상황을 먼저 살피고 여건에 맞게 방법을 바꾸는 성향입니다. 여러 가능성을 생각하는 장점이 있지만, 선택을 오래 미루지 않도록 스스로 결정할 기준을 세워두면 좋습니다.',
];
const groupReadings=[
  {name:'비겁',gods:['비견','겁재'],
    character:'남이 정한 답을 따르기보다 직접 판단하고 움직이려는 면도 두드러집니다. 자기 방식이 분명한 만큼, 다른 의견을 받아들일 여지를 남기는 것이 과제가 됩니다.',
    work:'스스로 결정할 몫이 있는 일에서 의욕을 발휘합니다. 지시를 그대로 따르기만 하는 환경보다, 맡은 영역을 책임지고 개선하는 자리가 잘 맞습니다. 함께 일할 때는 누가 무엇을 결정할지 미리 정해두면 힘겨루기가 줄어듭니다.',
    money:'돈은 스스로 선택하고 생활을 꾸릴 수 있게 해주는 수단으로 받아들입니다. 가까운 사람과 함께 쓰거나 마련하는 돈도 각자의 몫을 분명히 해두는 편이 마음을 편하게 합니다. 경쟁심 때문에 지출을 늘리기보다 자신에게 필요한 기준을 지키는 것이 과제입니다.',
    relationships:'가까워져도 서로의 선택과 생활을 존중하는 관계에서 편안함을 느낍니다. 연애에서도 한쪽이 일방적으로 이끄는 관계보다 나란히 의논하는 관계가 잘 맞습니다. 의견이 다를 때는 설득을 서두르기보다 상대가 중요하게 여기는 것을 먼저 들어보면 좋습니다.'},
  {name:'식상',gods:['식신','상관'],
    character:'생각을 말이나 결과물로 표현할 때 자신의 장점이 잘 드러납니다. 하고 싶은 말과 아이디어가 많은 만큼, 끝까지 마무리할 것을 고르는 일이 중요합니다.',
    work:'생각을 구체적인 결과물로 만들어내는 일에서 보람을 얻습니다. 설명하고 가르치거나, 손으로 만들고 표현하는 과정에서 재능을 쌓습니다. 새로운 시도만 늘리기보다 하나를 완성해 남에게 보여주는 습관이 강점을 살려줍니다.',
    money:'자신이 만든 결과나 익힌 기술을 수입으로 연결하는 과정에 관심을 둡니다. 좋아하는 일을 위해 쓰는 돈에는 관대하므로, 즐기는 데 드는 비용과 생활에 필요한 돈을 나눠두면 좋습니다. 재능이 있다는 해석이 곧 수입이 보장된다는 뜻은 아닙니다.',
    relationships:'말과 행동으로 마음을 표현하고 함께 즐길 거리가 있을 때 친밀해집니다. 연애에서도 대화가 잘 통하는지를 중요하게 생각합니다. 솔직함이 장점이지만, 상대가 듣기 편한 때와 표현을 고르면 불필요한 오해가 줄어듭니다.'},
  {name:'재성',gods:['편재','정재'],
    character:'생각만 하기보다 실제로 무엇을 얻고 바꿀 수 있는지 살피는 면도 두드러집니다. 결과를 챙기는 능력이 장점이지만, 모든 선택의 가치를 성과만으로 판단하지 않을 여유도 필요합니다.',
    work:'목표와 결과가 구체적으로 보이는 일에 집중하는 성향입니다. 필요한 사람과 자원을 연결하거나 진행 상황을 챙기는 데 강점이 있습니다. 눈앞의 성과를 챙기면서도 자신이 감당할 수 있는 일의 양을 함께 살펴야 합니다.',
    money:'얼마를 벌었는지뿐 아니라 가진 것을 어떻게 관리하고 사용할지에도 관심을 둡니다. 기회를 알아보는 것과 실제로 감당할 수 있는 범위를 구분하는 일이 중요합니다. 돈의 규모를 크게 만드는 것보다 지킬 몫과 쓸 몫을 정해두는 방식이 도움이 됩니다.',
    relationships:'마음을 말로만 전하기보다 시간을 내거나 필요한 것을 챙겨주는 행동으로 표현합니다. 연애에서도 함께 생활을 꾸릴 수 있는지, 서로 약속을 지키는지를 중요하게 생각합니다. 다만 무엇을 해줬는지보다 상대가 어떤 마음을 원하는지도 물어보면 좋습니다.'},
  {name:'관성',gods:['칠살','정관'],
    character:'맡은 역할을 제대로 해내고 약속을 지키려는 면도 두드러집니다. 책임감으로 신뢰를 쌓지만, 기대에 맞추느라 자신의 부담을 뒤로 미루지 않는 것이 과제입니다.',
    work:'역할과 기준이 분명하고 쌓은 실력을 인정받는 일에서 안정감을 느낍니다. 어려운 상황에서도 해야 할 일을 정리하고 책임지는 성향입니다. 잘해내야 한다는 압박이 커질 때는 우선순위를 정하고 맡지 않아도 될 일까지 떠안지 않는 것이 중요합니다.',
    money:'금전 문제에서도 약속과 책임을 중요하게 여깁니다. 정기적으로 나가는 비용이나 함께 부담하기로 한 돈을 챙기는 데 신경을 씁니다. 남에게 신뢰를 주려다가 자기 여유를 넘는 부담까지 약속하지 않는 것이 과제입니다.',
    relationships:'가까운 사이일수록 약속을 지키고 믿을 수 있는 사람인지를 중요하게 생각합니다. 연애에서도 말의 크기보다 꾸준한 태도에서 안정감을 느낍니다. 책임감으로 관계를 지키되, 서로에게 바라는 기준을 말로 확인하면 혼자 참는 일이 줄어듭니다.'},
  {name:'인성',gods:['편인','정인'],
    character:'바로 행동하기 전에 충분히 이해하고 자기 안에서 정리하려는 면도 두드러집니다. 깊이 생각하는 힘이 장점이지만, 준비가 끝날 때까지 첫걸음을 미루지 않는 것이 과제입니다.',
    work:'배우고 조사한 것을 정리해 자기 전문성으로 만드는 데 강점이 있습니다. 빠르게 결론을 내야 하는 환경보다 충분히 이해하고 설명할 과정이 있을 때 편안함을 느낍니다. 배운 것을 작은 결과물로 옮기는 습관이 생각과 실행을 이어줍니다.',
    money:'돈을 쓸 때도 납득할 만한 이유와 마음의 여유를 중요하게 생각합니다. 배우거나 생활의 바탕을 갖추는 데 드는 비용에 의미를 둡니다. 정보를 더 모으는 것만으로 결정을 미루지 않도록 자신이 쓸 수 있는 범위와 선택 기준을 먼저 정하면 좋습니다.',
    relationships:'자신의 생각을 충분히 들어주고 이해해주는 사람에게 마음을 여는 성향입니다. 연애에서도 서둘러 가까워지기보다 대화를 통해 신뢰를 쌓는 과정을 중요하게 생각합니다. 상대가 알아주기를 기다리기만 하기보다 필요한 배려를 직접 말하면 관계가 편안해집니다.'},
];

export function interpretChart(chart:Chart):Interpretation{
  const pillars=[chart.year,chart.month,chart.day,chart.hour];
  if(pillars.some(pillar=>!validPillars.has(pillar)))throw new Error('Invalid chart for interpretation');
  const features=extract(chart).filter(feature=>feature.priority>=2&&feature.family!=='신살·운성');
  const has=(id:string)=>features.some(feature=>feature.ruleId===id);
  const dayStem=chart.day[0],element=Math.floor(STEMS.indexOf(dayStem)/2);
  const gods=[...pillars.flatMap((pillar,index)=>index===2?[]:[tenGod(dayStem,pillar[0])]),
    ...pillars.map(pillar=>tenGod(dayStem,hidden[pillar[1]][0]))];
  const groups=groupReadings.map(group=>({...group,count:gods.filter(god=>group.gods.includes(god)).length}));
  // Keep all joint leaders: tied counts do not establish a stronger group.
  const top=groups.filter(group=>group.count===Math.max(...groups.map(group=>group.count)));
  const groupRuleIds=features.filter(feature=>top.some(group=>group.gods.includes(feature.ruleId>='M001'&&feature.ruleId<='M010'?featureName(feature.ruleId):''))).map(feature=>feature.ruleId);
  const dayRuleId=`M${String(16+element).padStart(3,'0')}`;
  const section=(id:string,title:string,paragraphs:string[],ruleIds=groupRuleIds):ReadingSection=>({id,title,paragraphs,ruleIds});
  const sections=[
    section('character','전체적인 성향',[dayThemes[element],...top.map(group=>group.character)],[dayRuleId,...groupRuleIds]),
    section('work','일과 재능',top.map(group=>group.work)),
    section('money','돈을 대하는 방식',top.map(group=>group.money)),
    section('relationships','인간관계와 연애',top.map(group=>group.relationships)),
  ];
  const joins=features.filter(feature=>['M023','M024','M025'].includes(feature.ruleId));
  if(has('M027')){
    sections[3].paragraphs.push(joins.length
      ?'사람과 함께하려는 마음과 자기 방향을 지키려는 마음이 함께 있는 성향입니다. 의견이 부딪힐 때 곧바로 관계의 결론을 내리기보다 함께할 부분과 각자 선택할 부분을 나눠보면 좋습니다.'
      :'서로의 방향이 다를 때 관계 안에서 조율할 일이 생깁니다. 의견 충돌을 관계 전체의 문제로 받아들이기보다 지금 다른 점을 구체적으로 말해보면 좋습니다.');
    sections[3].ruleIds=[...groupRuleIds,'M027',...joins.map(feature=>feature.ruleId)];
  }
  const season=features.find(feature=>['M011','M012','M013','M014','M015'].includes(feature.ruleId))!;
  const basis=[
    {label:'일간과 오행',text:`일간 ${dayStem}(${stemReadings[STEMS.indexOf(dayStem)]}), ${elements[element]}. 전체적인 성향의 첫 문단에 사용했습니다.`},
    {label:'태어난 계절',text:`월지 ${chart.month[1]}, ${featureName(season.ruleId)}. 원국의 계절 구성이며, 이것만으로 성격이나 시기별 운세를 판정하지 않습니다.`},
    {label:'십성 분포',text:`일간을 제외한 천간 3곳과 네 지지의 본기 4곳을 세었습니다. ${groups.map(group=>`${group.name} ${group.count}곳`).join(', ')}. 가장 많이 나타난 관계를 생활 영역별 창작 풀이의 기준으로 삼았으며, 같은 수인 관계는 모두 반영했습니다. 개수는 일간 강약이나 운의 좋고 나쁨을 뜻하지 않습니다.`},
    {label:'뿌리와 드러난 기운',text:`지장간에 일간과 같은 오행이 ${has('M022')?'있습니다(통근)':'없습니다'}. 월지의 지장간이 천간에 ${has('M021')?'드러납니다(투간)':'드러나지 않습니다'}. 이 두 조건만으로 일간 강약이나 용신을 정하지 않습니다.`},
    {label:'합과 충',text:`${joins.length?joins.map(feature=>featureName(feature.ruleId)).join('·')+' 표지가 있습니다.':'현재 풀이에서 쓰는 천간합·육합·삼합 표지는 없습니다.'} ${has('M027')?'충 표지가 있어 관계를 조정하는 주제에 반영했습니다.':'충 표지는 확인되지 않습니다.'} 표지 자체가 특정 사건이나 이별을 예고하지는 않습니다.`},
  ];
  const usedIds=new Set([dayRuleId,season.ruleId,...groupRuleIds,...joins.map(feature=>feature.ruleId),...['M021','M022','M027'].filter(has)]);
  const references=features.filter(feature=>usedIds.has(feature.ruleId)).map(feature=>({ruleId:feature.ruleId,feature:featureName(feature.ruleId)}));
  return {kind:'chart',sections,basis,references};
}
function featureName(id:string){return ruleset.rules.find(rule=>rule.id===id)!.feature;}
