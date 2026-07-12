-- 이음(loveminder) 전체 스키마 — 새 Supabase 프로젝트 SQL Editor에 이 파일 전체를 붙여넣고 Run 하세요.
-- (0001~0004 마이그레이션을 순서대로 합친 것)

-- ====================================================================
-- supabase/migrations/0001_init.sql
-- ====================================================================
-- 이음 (Ieum) initial schema
-- 기획서 5장 데이터 모델 기반

create extension if not exists "pgcrypto";

-- 1) 사용자 보조 프로필 (auth.users 1:1)
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  intro_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- 2) 일기 엔트리 (하루 1개)
create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type text not null check (type in ('free','today','question','before_ai','after_ai')),
  content text not null,
  process jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists diary_entries_user_date_idx
  on public.diary_entries (user_id, date desc);

-- 3) 분석 결과 (14일 완료 시 1회)
create table if not exists public.writing_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null,
  recommended_prompt text not null,
  reasoning text not null,
  created_at timestamptz not null default now()
);

create index if not exists writing_analyses_user_created_idx
  on public.writing_analyses (user_id, created_at desc);

-- Row Level Security
alter table public.user_profiles enable row level security;
alter table public.diary_entries enable row level security;
alter table public.writing_analyses enable row level security;

-- Policies: 본인 데이터만 read/write
drop policy if exists "self read" on public.user_profiles;
create policy "self read" on public.user_profiles
  for select using (auth.uid() = user_id);
drop policy if exists "self upsert" on public.user_profiles;
create policy "self upsert" on public.user_profiles
  for insert with check (auth.uid() = user_id);
drop policy if exists "self update" on public.user_profiles;
create policy "self update" on public.user_profiles
  for update using (auth.uid() = user_id);

drop policy if exists "diary self read" on public.diary_entries;
create policy "diary self read" on public.diary_entries
  for select using (auth.uid() = user_id);
drop policy if exists "diary self write" on public.diary_entries;
create policy "diary self write" on public.diary_entries
  for insert with check (auth.uid() = user_id);
drop policy if exists "diary self update" on public.diary_entries;
create policy "diary self update" on public.diary_entries
  for update using (auth.uid() = user_id);
drop policy if exists "diary self delete" on public.diary_entries;
create policy "diary self delete" on public.diary_entries
  for delete using (auth.uid() = user_id);

drop policy if exists "analysis self read" on public.writing_analyses;
create policy "analysis self read" on public.writing_analyses
  for select using (auth.uid() = user_id);
-- 쓰기는 Edge Function이 service role로 직접 insert (RLS 우회).


-- ====================================================================
-- supabase/migrations/0002_cycles.sql
-- ====================================================================
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


-- ====================================================================
-- supabase/migrations/0003_user_email.sql
-- ====================================================================
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


-- ====================================================================
-- supabase/migrations/0004_analysis_client_insert.sql
-- ====================================================================
-- 이음: writing_analyses 클라이언트 insert 허용
-- 배경: 분석이 Supabase Edge Function(service role) → 로컬 KoBERT FastAPI 서버로 이동.
--       이제 프론트가 결과를 직접 저장하므로, 본인 행 insert 정책이 필요하다.
--       (기존에는 read 정책만 있고 쓰기는 service role 우회였음)

drop policy if exists "analysis self write" on public.writing_analyses;
create policy "analysis self write" on public.writing_analyses
  for insert with check (auth.uid() = user_id);


