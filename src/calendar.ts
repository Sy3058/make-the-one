import Astronomy from 'astronomy-engine';
import moment from 'moment-timezone';
import { createHash } from 'node:crypto';

export const STEMS = [...'甲乙丙丁戊己庚辛壬癸'];
export const BRANCHES = [...'子丑寅卯辰巳午未申酉戌亥'];
export const POLICY_ID = 'kr-mean-solar-23-v1';
const DAY_MS = 86_400_000;
const termsCache = new Map<number, SolarTerm[]>();
const windowCache = new Map<number, SolarTerm[]>();
export type SolarTerm = { year: number; longitude: number; utc: Date; isJie: boolean };
export type Place = { id: string; name: string; longitude: number; latitude?: number; source: string };
export type Chart = { year: string; month: string; day: string; hour: string };
export type Occurrence = { chart: Chart; chartId: string; place: Place; utc: Date; civil: string;
  utcOffsetMin: number; solar: string; boundaryDistanceMin: number };
const mod = (n:number,m:number) => ((n % m)+m)%m;
export function ganzhi(index:number) { const i=mod(index,60); return STEMS[i%10]+BRANCHES[i%12]; }

// 24 apparent longitude events, from Li Chun to the following Da Han.
export function solarTerms(year:number): SolarTerm[] {
  const existing=termsCache.get(year); if(existing) return existing;
  const first=Date.UTC(year,1,4,0);
  const terms=Array.from({length:24},(_,i)=>{
    const longitude=mod(315+15*i,360);
    const approximate=new Date(first+i*15.2184*DAY_MS-3*DAY_MS);
    const found=Astronomy.SearchSunLongitude(longitude,approximate,7);
    if (!found) throw new Error(`solar term missing: ${year}/${longitude}`);
    return {year,longitude,utc:found.date,isJie:i%2===0};
  });
  termsCache.set(year,terms); return terms;
}
export function nearbyTerms(utc:Date) {
  const year=utc.getUTCFullYear();
  const existing=windowCache.get(year); if(existing) return existing;
  const sorted=[year-1,year,year+1].flatMap(solarTerms).sort((a,b)=>a.utc.getTime()-b.utc.getTime());
  windowCache.set(year,sorted); return sorted;
}
export function solarClock(utc:Date,longitude:number):Date {
  if(!Number.isFinite(longitude)||longitude<124||longitude>132) throw new Error('invalid Korean longitude');
  return new Date(utc.getTime()+longitude*240_000);
}
export function pillars(utc:Date, place:Place):Chart {
  const terms=nearbyTerms(utc).filter(t=>t.utc<=utc);
  const liChun=[...terms].reverse().find(t=>t.longitude===315);
  const jie=[...terms].reverse().find(t=>t.isJie);
  if(!liChun||!jie) throw new Error('no preceding solar term');
  const yearIndex=mod(liChun.year-1984,60), yearStem=yearIndex%10;
  const monthOffset=mod(jie.longitude-315,360)/30;
  const monthStem=mod(2*(yearStem%5)+2+monthOffset,10);
  const monthBranch=mod(2+monthOffset,12);
  const solar=solarClock(utc,place.longitude);
  // Use the solar calendar date after 23:00, independent of historical civil offset.
  const daySerial=Math.floor((Date.UTC(solar.getUTCFullYear(),solar.getUTCMonth(),solar.getUTCDate())-
    Date.UTC(2000,0,1))/DAY_MS)+(solar.getUTCHours()>=23?1:0);
  const dayIndex=mod(54+daySerial,60); // 2000-01-01 = 戊午
  const hourBranch=Math.floor(mod(solar.getUTCHours()+1,24)/2);
  const hourStem=mod(2*(dayIndex%10%5)+hourBranch,10);
  return {year:ganzhi(yearIndex),month:STEMS[monthStem]+BRANCHES[monthBranch],
    day:ganzhi(dayIndex),hour:STEMS[hourStem]+BRANCHES[hourBranch]};
}
export function chartId(chart:Chart,policy=POLICY_ID) {
  return createHash('sha256').update(JSON.stringify([policy,chart.year,chart.month,chart.day,chart.hour])).digest('hex');
}
export function occurrence(utc:Date,place:Place):Occurrence {
  const chart=pillars(utc,place);
  const civil=moment.utc(utc).tz('Asia/Seoul');
  const solar=solarClock(utc,place.longitude);
  // Day/hour boundaries always coincide at odd solar-clock hours.
  const solarMin=solar.getUTCHours()*60+solar.getUTCMinutes()+solar.getUTCSeconds()/60;
  const sinceBranchStart=mod(solarMin-1380,120);
  const branchDistance=Math.min(sinceBranchStart,120-sinceBranchStart);
  const terms=nearbyTerms(utc);
  const termDistance=Math.min(...terms.filter(t=>t.isJie).map(t=>Math.abs(t.utc.getTime()-utc.getTime())/60_000));
  return {chart,chartId:chartId(chart),place,utc,civil:civil.format('YYYY-MM-DD HH:mm:ss'),
    utcOffsetMin:civil.utcOffset(),solar:solar.toISOString().slice(0,19).replace('T',' '),
    boundaryDistanceMin:Math.min(branchDistance,termDistance)};
}
export function testCivilRoundtrip(local:string) {
  // Input support is deliberately strict: an absent DST hour is rejected.
  const parsed=moment.tz(local,'YYYY-MM-DD HH:mm:ss',true,'Asia/Seoul');
  if(!parsed.isValid()||parsed.format('YYYY-MM-DD HH:mm:ss')!==local) throw new Error('nonexistent/invalid civil time');
  return parsed.toDate();
}
