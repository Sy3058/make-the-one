export const STEMS = [...'甲乙丙丁戊己庚辛壬癸'];
export const BRANCHES = [...'子丑寅卯辰巳午未申酉戌亥'];
export type Chart = {year:string;month:string;day:string;hour:string};
export function ganzhi(index:number){
  const i=((index%60)+60)%60;
  return STEMS[i%10]+BRANCHES[i%12];
}
