-- 이음: 14일 사이클 도입
-- 사이클이 끝나면 cycle_started_at만 갱신하고, diary_entries는 보존한다.

alter table public.user_profiles
  add column if not exists cycle_started_at date;

-- 기존 사용자 보정: cycle_started_at이 NULL이면 가장 오래된 일기 날짜로 설정,
-- 일기가 아예 없으면 오늘로 설정.
update public.user_profiles up
set cycle_started_at = coalesce(
  (select min(date) from public.diary_entries de where de.user_id = up.user_id),
  current_date
)
where cycle_started_at is null;
