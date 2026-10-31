import reference from '../data/kasi-solar-terms.json' with {type:'json'};
import {solarTerms} from './calendar.ts';

export type TermReference={year:number;longitude:number;kst:string};
export function validateSolarTerms(fixtures:TermReference[]=reference.terms){
  if(!fixtures.length) throw new Error('KASI solar-term references are missing');
  const seen=new Set<string>();
  const comparisons=fixtures.map(row=>{
    const key=`${row.year}/${row.longitude}`;
    if(seen.has(key)) throw new Error(`Duplicate KASI reference ${key}`);
    seen.add(key);
    if(!Number.isInteger(row.year)||!Number.isInteger(row.longitude)||row.longitude<0||row.longitude>=360||row.longitude%15!==0||!row.kst.endsWith('+09:00'))
      throw new Error(`Invalid KASI reference ${key}`);
    const expected=Date.parse(row.kst);
    if(!Number.isFinite(expected)||new Date(expected+9*3_600_000).getUTCFullYear()!==row.year) throw new Error(`Invalid KASI date ${key}`);
    // Jan terms belong to the previous Li-Chun-based term cycle.
    const actual=solarTerms(row.longitude>=285&&row.longitude<=300?row.year-1:row.year).find(t=>t.longitude===row.longitude);
    if(!actual) throw new Error(`Missing computed term ${key}`);
    const rawErrorSeconds=Math.abs(actual.utc.getTime()-expected)/1000;
    const roundedErrorMinutes=Math.abs(Math.round(actual.utc.getTime()/60_000)-expected/60_000);
    return {...row,rawErrorSeconds,roundedErrorMinutes};
  });
  const mismatches=comparisons.filter(row=>row.roundedErrorMinutes>1);
  if(mismatches.length) throw new Error(`KASI solar-term gate failed: ${mismatches.length} reference(s) differ by more than one rounded minute`);
  return {version:reference.version,checked:comparisons.length,years:[...new Set(fixtures.map(x=>x.year))],
    comparison:'nearest-minute' as const,maxRoundedErrorMinutes:Math.max(...comparisons.map(x=>x.roundedErrorMinutes)),
    maxRawErrorSeconds:Math.max(...comparisons.map(x=>x.rawErrorSeconds))};
}
