import type {Recommendation} from './experience-state';

export function formatCivilBirth(birth: Recommendation['fictionalBirth']): string {
  const minutes = Math.abs(birth.utcOffsetMinutes);
  const sign = birth.utcOffsetMinutes < 0 ? '-' : '+';
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const remainder = String(minutes % 60).padStart(2, '0');
  const civilTime = birth.civilTime.slice(0, 16).replace('T', ' ');
  return `${civilTime} (UTC${sign}${hours}:${remainder})`;
}

export const cities:Record<string,string>={seoul:'서울',seongnam:'성남',incheon:'인천',suwon:'수원',chuncheon:'춘천',sokcho:'속초',gangneung:'강릉',daejeon:'대전',cheongju:'청주',cheonan:'천안',jeonju:'전주',gunsan:'군산',gwangju:'광주',mokpo:'목포',daegu:'대구',pohang:'포항',busan:'부산',changwon:'창원',ulsan:'울산',jeju:'제주'};
