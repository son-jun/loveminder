import { differenceInCalendarDays, format, parseISO } from 'date-fns';

export function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function dayNumberSinceStart(startISO: string, dateKey: string): number {
  return differenceInCalendarDays(parseISO(dateKey + 'T00:00:00'), parseISO(startISO)) + 1;
}

export function formatNiceDate(iso: string): string {
  // "5월 23일 (목)"
  const d = parseISO(iso + 'T00:00:00');
  return format(d, 'M월 d일');
}

export function weekdayLabel(iso: string): string {
  const d = parseISO(iso + 'T00:00:00');
  const map = ['일', '월', '화', '수', '목', '금', '토'];
  return map[d.getDay()];
}
