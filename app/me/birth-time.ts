import type {Recommendation} from './experience-state';

export function formatCivilBirth(birth: Recommendation['fictionalBirth']): string {
  const minutes = Math.abs(birth.utcOffsetMinutes);
  const sign = birth.utcOffsetMinutes < 0 ? '-' : '+';
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const remainder = String(minutes % 60).padStart(2, '0');
  const civilTime = birth.civilTime.slice(0, 16).replace('T', ' ');
  return `${civilTime} (UTC${sign}${hours}:${remainder})`;
}
