-- ============================================================
-- 이음(Ieum) 새 Supabase 프로젝트 전체 설정
-- 사용법: Supabase 대시보드 → SQL Editor → New query →
--         이 파일 전체를 붙여넣고 RUN (한 번이면 됨, 여러 번 실행해도 안전)
-- 내용: migrations 0001~0004 를 순서대로 합친 것.
-- ============================================================


-- ─────────────────────────────────────────────────────────
-- 0001_init : 테이블 3개 + RLS
-- ─────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  intro_seen_at timestamptz,
  created_at timestamptz not null default now()
);

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

alter table public.user_profiles enable row level security;
alter table public.diary_entries enable row level security;
alter table public.writing_analyses enable row level security;

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


-- ─────────────────────────────────────────────────────────
-- 0002_cycles : 14일 사이클 컬럼
-- ─────────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists cycle_started_at date;

update public.user_profiles up
set cycle_started_at = coalesce(
  (select min(date) from public.diary_entries de where de.user_id = up.user_id),
  current_date
)
where cycle_started_at is null;


-- ─────────────────────────────────────────────────────────
-- 0003_user_email : 대시보드 식별용 email 컬럼 + 자동 채움 트리거
-- ─────────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists user_email text;
alter table public.diary_entries
  add column if not exists user_email text;
alter table public.writing_analyses
  add column if not exists user_email text;

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

create index if not exists diary_entries_email_idx on public.diary_entries (user_email);
create index if not exists writing_analyses_email_idx on public.writing_analyses (user_email);


-- ─────────────────────────────────────────────────────────
-- 0004_analysis_client_insert : 프론트가 분석결과 직접 저장 허용
-- ─────────────────────────────────────────────────────────
drop policy if exists "analysis self write" on public.writing_analyses;
create policy "analysis self write" on public.writing_analyses
  for insert with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────
-- 0005_test_account_reset : 테스트 계정 로그아웃 초기화
-- ─────────────────────────────────────────────────────────
drop policy if exists "analysis self delete" on public.writing_analyses;
create policy "analysis self delete" on public.writing_analyses
  for delete using (auth.uid() = user_id);

drop policy if exists "profile self delete" on public.user_profiles;
create policy "profile self delete" on public.user_profiles
  for delete using (auth.uid() = user_id);
