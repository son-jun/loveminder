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
