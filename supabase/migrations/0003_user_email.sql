-- 이음: 우리 테이블에 user_email 컬럼 추가
-- 목적: 대시보드/SQL Editor에서 데이터를 볼 때 한눈에 사용자를 식별
-- RLS는 여전히 user_id 기준으로 동작. user_email은 표시 편의용.

-- 1) 컬럼 추가
alter table public.user_profiles
  add column if not exists user_email text;
alter table public.diary_entries
  add column if not exists user_email text;
alter table public.writing_analyses
  add column if not exists user_email text;

-- 2) 기존 데이터 백필
update public.user_profiles up
set user_email = au.email
from auth.users au
where up.user_id = au.id and up.user_email is null;

update public.diary_entries de
set user_email = au.email
from auth.users au
where de.user_id = au.id and de.user_email is null;

update public.writing_analyses wa
set user_email = au.email
from auth.users au
where wa.user_id = au.id and wa.user_email is null;

-- 3) 새 row insert 시 자동으로 email 채우는 trigger 함수
create or replace function public.fill_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_email is null then
    select email into new.user_email from auth.users where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_user_email on public.diary_entries;
create trigger trg_fill_user_email
  before insert on public.diary_entries
  for each row execute function public.fill_user_email();

drop trigger if exists trg_fill_user_email on public.writing_analyses;
create trigger trg_fill_user_email
  before insert on public.writing_analyses
  for each row execute function public.fill_user_email();

drop trigger if exists trg_fill_user_email on public.user_profiles;
create trigger trg_fill_user_email
  before insert on public.user_profiles
  for each row execute function public.fill_user_email();

-- 4) auth.users.email이 바뀌면 우리 테이블의 user_email도 동기화하는 trigger
create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.user_profiles    set user_email = new.email where user_id = new.id;
    update public.diary_entries    set user_email = new.email where user_id = new.id;
    update public.writing_analyses set user_email = new.email where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_user_email on auth.users;
create trigger trg_sync_user_email
  after update on auth.users
  for each row execute function public.sync_user_email();

-- 5) 대시보드에서 보기 좋은 인덱스 (선택)
create index if not exists diary_entries_email_idx on public.diary_entries (user_email);
create index if not exists writing_analyses_email_idx on public.writing_analyses (user_email);
