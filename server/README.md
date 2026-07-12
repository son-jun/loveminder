---
title: 이음 KoBERT 분석 서버
emoji: 🌿
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# 이음 KoBERT 분석 서버

글 유형 판독을 AI(Gemini) 대신 **KoBERT 하이브리드 모델**로 수행합니다.
AI는 마지막 "결과 정리"(항목 의미 설명 + 추천 프롬프트 작성)에만 사용됩니다.

> 위 YAML 헤더는 Hugging Face Spaces(Docker) 배포용입니다. 로컬 실행에는 영향 없어요.

## 구성

```
server/
  app.py                     # FastAPI (모델은 서버 시작 시 1회 로드)
  predict_hybrid.py          # predict_one() — KoBERT 3축 8유형 판독
  SentiWord_info.json        # 주관성 사전
  Dockerfile                 # 배포용 이미지 (CPU 추론)
  모델_자동판독/
    config.json
    hybrid_params.json
    kobert_multilabel.pt      # 모델 가중치 (368MB) — git 미포함
```

## 로컬 실행

```bash
cd server
서버 실행.bat                  # (Windows) venv 생성 + 의존성 설치 + 실행
# 또는 수동:
python -m venv --system-site-packages .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env         # GEMINI_API_KEY 채우기 (선택)
python app.py                  # http://127.0.0.1:8000
```

## 엔드포인트

- `GET  /health` — 서버/모델/Gemini 키 상태
- `POST /predict` — `{"text": "..."}` → 단일 글 판독 JSON
- `POST /analyze` — `{"entries":[{date,type,content,process}, ...]}` (14편 이상)
  → `{ items, recommendedPrompt, reasoning, _debug }` (프론트 WritingAnalysis 형태)

## 환경변수

| 이름 | 설명 |
|------|------|
| `GEMINI_API_KEY` | 있으면 AI 정리, 없으면 규칙 기반 fallback |
| `GEMINI_MODEL` | 기본 `gemini-2.5-flash` |
| `ANALYZE_TOKEN` | 설정 시 `/analyze`·`/predict` 호출에 `x-analyze-token` 헤더 필요 (공개 배포 보호) |
| `MODEL_URL` | 시작 시 가중치가 없으면 이 URL에서 내려받음 |
| `ALLOW_ORIGINS` | CORS 허용 오리진(콤마구분). 미설정 시 전체 허용 |
| `PORT` | 리슨 포트 (배포 플랫폼이 주입, HF는 7860) |

---

## 공개 배포 (다른 사람도 쓰게)

KoBERT 서버는 torch + 368MB 모델이라 Supabase/Vercel엔 못 올립니다. **파이썬 컨테이너 호스팅 1곳**이 필요합니다.

### A. Hugging Face Spaces (무료·추천)

1. huggingface.co → **New Space** → **SDK: Docker** 선택.
2. 이 `server/` 폴더 내용을 Space 저장소에 올립니다(웹 업로드 또는 git).
   - 모델 가중치 `모델_자동판독/kobert_multilabel.pt`(368MB)도 함께 업로드하면 이미지에 포함됩니다(HF가 LFS 자동 처리).
   - 업로드가 부담되면 대신 **Space Secret `MODEL_URL`** 에 가중치 다운로드 URL을 넣으면 시작 시 자동으로 받습니다.
3. Space **Settings → Variables and secrets** 에 추가:
   - `GEMINI_API_KEY` (필수 — AI 정리)
   - `ANALYZE_TOKEN` (권장 — 아무나 못 부르게)
   - `ALLOW_ORIGINS` (권장 — 배포한 사이트 주소, 예: `https://내사이트.com`)
4. 배포되면 주소가 나옵니다: `https://<user>-<space>.hf.space`
5. 프론트 환경변수(사이트 호스팅 쪽)에 설정 후 재배포:
   ```
   VITE_ANALYZE_API=https://<user>-<space>.hf.space
   VITE_ANALYZE_TOKEN=<위 ANALYZE_TOKEN 값>
   ```

> 무료 Space는 일정 시간 미사용 시 잠들어, 첫 요청에서 깨어나는 데 30~60초가 걸릴 수 있습니다.

### B. Render / Railway / Fly.io

동일한 `Dockerfile`로 배포됩니다. 주의: **RAM 1.5~2GB 이상** 플랜이어야 torch+모델이 뜹니다(무료 512MB는 부족).
- 빌드: 이 `server/` 폴더 기준 Docker 빌드.
- 가중치는 git에 없으므로 **`MODEL_URL`** 환경변수로 받게 하거나, 이미지에 직접 포함시키세요.
- 환경변수는 위 표와 동일. 플랫폼이 주는 `PORT`를 자동 사용합니다.

### 공통 체크
- 배포 사이트는 **https** 이므로 KoBERT 서버도 **https**여야 합니다(HF/Render 등은 자동 https). http 주소로 두면 브라우저가 mixed-content로 차단합니다.
- `VITE_ANALYZE_API`는 **끝에 슬래시 없이** 넣으세요.
