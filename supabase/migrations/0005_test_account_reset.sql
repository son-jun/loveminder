-- 테스트 계정 로그아웃 초기화에 필요한 본인 데이터 삭제 정책.
-- auth.uid()가 일치하는 행만 삭제할 수 있으므로 다른 사용자의 데이터에는 접근할 수 없다.

drop policy if exists "analysis self delete" on public.writing_analyses;
create policy "analysis self delete" on public.writing_analyses
  for delete using (auth.uid() = user_id);

drop policy if exists "profile self delete" on public.user_profiles;
create policy "profile self delete" on public.user_profiles
  for delete using (auth.uid() = user_id);
