import {STEMS,type Chart} from './ganzhi';
export const elements=['wood','fire','earth','metal','water'] as const;
export type Element=typeof elements[number];
export const elementLabels:Record<Element,string>={wood:'목',fire:'화',earth:'토',metal:'금',water:'수'};
const branchElements:Record<string,Element>={子:'water',丑:'earth',寅:'wood',卯:'wood',辰:'earth',巳:'fire',午:'fire',未:'earth',申:'metal',酉:'metal',戌:'earth',亥:'water'};
export const elementPolicy='eight-visible-characters-v1';
export function elementDistribution(chart:Chart){
  const counts:Record<Element,number>={wood:0,fire:0,earth:0,metal:0,water:0};
  for(const pillar of [chart.year,chart.month,chart.day,chart.hour]){
    if(!/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(pillar))throw new Error('Invalid chart pillar');
    counts[elements[Math.floor(STEMS.indexOf(pillar[0])/2)]]++;counts[branchElements[pillar[1]]]++;
  }
  const minimum=Math.min(...Object.values(counts));
  // A transparent distribution rule, not a strength, season or yongshin judgment.
  return {policy:elementPolicy,counts,targets:elements.filter(element=>counts[element]===minimum)};
}
export function elementSupport(nameElements:readonly (Element|null)[],targets:readonly Element[]){
  return nameElements.length?nameElements.filter(element=>element!==null&&targets.includes(element)).length/nameElements.length:0;
}
