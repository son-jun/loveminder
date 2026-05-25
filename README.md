# 이음 (Ieum)

> 14일간 매일의 글이 나만의 AI 프롬프트가 된다.
> 글쓰기 결과와 과정을 함께 분석해, 사용자의 문체에 맞는 시스템 프롬프트를 만들어주는 웹 서비스.

상세 명세는 `이음_기획서.md` 참고.

## 스택

- **프론트**: Vite + React 19 + TypeScript + react-router-dom + date-fns
- **백엔드/DB**: Supabase (Auth + Postgres + Edge Function)
- **AI**: Google Gemini 2.5 Flash — Supabase Edge Function이 프록시 (API 키 보호). 무료 한도로 충분.

## 디렉토리

```
src/
  components/    UI 컴포넌트 (TabBar, Icon, IntroModal)
  hooks/         useWritingTracker (글쓰기 과정 추적, 6-1B)
  lib/           supabase, auth, diary, date, processLabel
  pages/         AuthPage, TodayPage, RecordsPage, AnalysisPage, SetupNotice
  styles/        tokens.css (디자인 토큰)
  types/         공용 타입
supabase/
  migrations/0001_init.sql           스키마 + RLS 정책
  functions/analyze/index.ts         Claude 호출 Edge Function
```

## 셋업

### 1. Supabase 프로젝트 만들기

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성.
2. SQL Editor 열고 `supabase/migrations/0001_init.sql` 전체를 붙여넣고 실행.
3. **Project Settings → API** 에서 다음 값 복사:
   - `Project URL`
   - `anon` public key
   - `service_role` secret key (Edge Function에서만 사용)

### 2. 프론트엔드 환경변수

프로젝트 루트에 `.env.local` 파일을 만들고 작성:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 3. Edge Function 배포

[Supabase CLI](https://supabase.com/docs/guides/cli) 가 필요합니다.

```bash
# 최초 1회
supabase login
supabase link --project-ref YOUR-PROJECT-REF

# Edge Function 시크릿 설정 (Gemini API 키)
# https://aistudio.google.com/apikey 에서 발급
supabase secrets set GEMINI_API_KEY=AIzaSy...
# (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는
#  supabase가 기본 주입하지만, 일부 환경에서 별도 등록이 필요할 수 있습니다.)

# 배포
supabase functions deploy analyze
```

### 4. 개발 서버 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 접속.

## 동작 흐름

1. 회원가입/로그인 (Supabase Auth).
2. **오늘 탭**: 첫 진입 시 사용 안내 모달(6-2) 1회 노출 → 일기 작성.
   - 텍스트 입력과 함께 글쓰기 과정 데이터(작성시간/멈춤/수정/붙여넣기 등)가 백그라운드로 수집됩니다.
   - "오늘의 글 저장" 시 일자별 1건으로 upsert.
3. **기록 탭**: 작성한 일기들을 날짜 역순으로 확인 + 진행률 바.
4. **분석 탭**:
   - 14일 미만 → 잠금 상태 (며칠 남았는지 안내).
   - 14일 도달 → 분석 시작 버튼 → Edge Function 호출 → 6개 항목 분석 + 추천 프롬프트 생성/저장.
   - 다시 들어오면 저장된 결과를 바로 보여줌.

## 주요 결정사항 메모

기획서 11장 "결정 필요" 항목 중 이 구현에서 잡은 기본값:

- **하루 1회 작성, 수정 가능**: 일자 unique, 같은 날 다시 저장 시 덮어쓰기.
- **"수정 횟수" 정의**: 텍스트 끝이 아닌 위치에서의 삽입·삭제만 카운트. 단순 append/끝 삭제는 제외.
- **과정 라벨 임계값**: 평균 ms/글자 1500ms↑ 또는 5초 멈춤 평균 5회↑ → 사색형 / 수정+삭제 비율 25%↑ → 수정 중심형 / 그 외 → 빠른 기록형.
- **추천 프롬프트 성격**: "문체 모방 위주" — 사용자의 어휘·문장 길이·종결어미 습관을 모방하도록 시스템 프롬프트에 명시.
- **AI 모델**: `gemini-2.5-flash` (Edge Function의 `GEMINI_MODEL` 상수에서 변경 가능). 무료 한도: 분당 15회·일 1,500회로 본 용도엔 충분.
- **내재화 전/후 비교 뷰**: MVP에 포함하지 않음. 데이터 모델(`type`)만 미리 준비됨.

색상 팔레트와 폰트는 기획서 9장 기준안 그대로 사용:
- 배경 `#FAF6F0` · 텍스트 `#3A352F` · 포인트 `#7C8C6A` · 보조 `#C97B5A`
- 본문 글꼴: Gowun Batang (구글 폰트)

## 개발 메모

```bash
npm run dev         # 개발 서버
npm run build       # 프로덕션 빌드
npx tsc --noEmit    # 타입 체크만
```
