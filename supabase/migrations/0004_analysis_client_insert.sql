-- 이음: writing_analyses 클라이언트 insert 허용
-- 배경: 분석이 Supabase Edge Function(service role) → 로컬 KoBERT FastAPI 서버로 이동.
--       이제 프론트가 결과를 직접 저장하므로, 본인 행 insert 정책이 필요하다.
--       (기존에는 read 정책만 있고 쓰기는 service role 우회였음)

drop policy if exists "analysis self write" on public.writing_analyses;
create policy "analysis self write" on public.writing_analyses
  for insert with check (auth.uid() = user_id);
