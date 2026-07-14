import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { supabase } from './supabase';
import { TOTAL_DAYS } from '../types';

// 현재 사이클 상태 표현
export interface CycleState {
  startDate: string; // YYYY-MM-DD
  dayNumber: number; // 1 ~ TOTAL_DAYS+ (사이클 진입한 날 수)
  isComplete: boolean; // dayNumber >= TOTAL_DAYS
  daysWritten: number; // 현재 사이클 안에서 실제로 작성한 distinct 일수
}

export async function getCycleStart(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('cycle_started_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data?.cycle_started_at) return data.cycle_started_at;
  // 프로필이 없거나 cycle 시작일이 비어있다면 가장 오래된 일기 날짜 또는 오늘로 설정.
  const { data: oldest } = await supabase
    .from('diary_entries')
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle();
  const start = oldest?.date ?? format(new Date(), 'yyyy-MM-dd');
  await supabase
    .from('user_profiles')
    .upsert(
      { user_id: userId, cycle_started_at: start },
      { onConflict: 'user_id' },
    );
  return start;
}

export async function advanceCycle(userId: string, fromDate: string = format(new Date(), 'yyyy-MM-dd')): Promise<string> {
  // 분석을 끝낸 다음, 사이클은 다음날부터 새로 시작한다.
  const next = format(addDays(parseISO(fromDate + 'T00:00:00'), 1), 'yyyy-MM-dd');
  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      { user_id: userId, cycle_started_at: next },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
  return next;
}

export function computeCycleState(
  startDate: string,
  entryDates: string[],
  today: string = format(new Date(), 'yyyy-MM-dd'),
  requiredDays: number = TOTAL_DAYS,
): CycleState {
  const start = parseISO(startDate + 'T00:00:00');
  const t = parseISO(today + 'T00:00:00');
  const elapsed = differenceInCalendarDays(t, start) + 1; // 1-based
  const daysWritten = entryDates.filter((d) => d >= startDate && d <= today).length;
  return {
    startDate,
    dayNumber: Math.max(1, elapsed),
    isComplete: daysWritten >= requiredDays,
    daysWritten,
  };
}
