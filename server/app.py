# -*- coding: utf-8 -*-
"""이음 KoBERT 분석 서버 (FastAPI).

역할
  - 서버 시작 시 predict_hybrid 를 import → KoBERT 모델/토크나이저/사전을 "한 번만" 로드.
  - POST /predict : 단일 텍스트 판독 (predict_one 그대로).
  - POST /analyze : 14일치 일기를 받아 (1) KoBERT 3축 판독 집계 →
                    (2) 글쓰기 과정(타이핑) 규칙 라벨 →
                    (3) Gemini 로 "결과 정리"(각 항목 의미 + 추천 프롬프트 + 이유) 생성 →
                    프론트가 그대로 저장/표시할 수 있는 WritingAnalysis JSON 반환.

기존에 글 "분석"에 쓰던 AI(Gemini)는 더 이상 유형을 판단하지 않는다.
KoBERT 가 판단하고, AI 는 마지막 정리(문장 다듬기 + 프롬프트 작성)에만 쓰인다.
"""
import os
import json
import time
from collections import Counter
from typing import Any

import requests
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BASE = os.path.dirname(os.path.abspath(__file__))


# .env(server/.env) 가 있으면 읽어 환경변수로 (python-dotenv 없이 가벼운 파서)
def _load_dotenv(path: str) -> None:
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv(os.path.join(BASE, ".env"))


# ── 모델 가중치 확보 ────────────────────────────────────────────────────────
# 배포 환경(예: git 빌드)에서는 368MB .pt 가 없을 수 있다.
# MODEL_URL 이 있으면 시작 시 1회 내려받는다. (HF Spaces 처럼 LFS 로 이미 있으면 건너뜀)
def _ensure_model() -> None:
    path = os.path.join(BASE, "모델_자동판독", "kobert_multilabel.pt")
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        return
    url = os.environ.get("MODEL_URL")
    if not url:
        return  # 없으면 predict_hybrid import 시점에 에러 → 로그로 안내
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print(f"[이음] 모델 다운로드: {url}")
    with requests.get(url, stream=True, timeout=600) as r:
        r.raise_for_status()
        tmp = path + ".part"
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
        os.replace(tmp, path)
    print(f"[이음] 모델 준비 완료 ({os.path.getsize(path)} bytes)")


_ensure_model()

# ── 모델 로드는 여기서 딱 한 번 (import 시점) ────────────────────────────────
# predict_hybrid 는 모듈 최상단에서 Kiwi/토크나이저/KoBERT 가중치를 로드한다.
from predict_hybrid import predict_one, TYPE_NAMES  # noqa: E402

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")
# 공개 배포 시 아무나 /analyze 를 못 부르게 하는 간단한 공유 토큰 (선택)
ANALYZE_TOKEN = os.environ.get("ANALYZE_TOKEN")
PORT = int(os.environ.get("PORT", "8000"))
# 분석에 필요한 최소 글 편수. 기본 14. 짧은 세션/시연에서는 MIN_ENTRIES=3 처럼 낮춘다.
# 주의: 프론트의 VITE_TOTAL_DAYS 와 반드시 같은 값이어야 한다.
MIN_ENTRIES = int(os.environ.get("MIN_ENTRIES", "14"))
MAX_ENTRIES = int(os.environ.get("MAX_ENTRIES", str(MIN_ENTRIES)))
TEST_ACCOUNT_EMAIL = os.environ.get("TEST_ACCOUNT_EMAIL", "").strip().lower()

# CORS 허용 오리진: ALLOW_ORIGINS(콤마구분) 있으면 그것만, 없으면 전체 허용
_origins_env = os.environ.get("ALLOW_ORIGINS", "").strip()
ALLOW_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()] or ["*"]

app = FastAPI(title="이음 KoBERT 분석 서버")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _check_token(x_analyze_token: str | None) -> None:
    if ANALYZE_TOKEN and x_analyze_token != ANALYZE_TOKEN:
        raise HTTPException(status_code=401, detail="invalid analyze token")


# ── 요청 스키마 ───────────────────────────────────────────────────────────
class PredictReq(BaseModel):
    text: str


class ProcessData(BaseModel):
    totalTimeMs: float = 0
    activeTimeMs: float = 0
    charCount: int = 0
    sentenceCount: int = 0
    deleteCount: int = 0
    editCount: int = 0
    pause2sCount: int = 0
    pause5sCount: int = 0
    pasteCount: int = 0
    burstSegments: list[float] = []


class Entry(BaseModel):
    date: str = ""
    type: str = ""
    content: str = ""
    process: ProcessData | None = None


class AnalyzeReq(BaseModel):
    entries: list[Entry]
    accountEmail: str = ""


# ── 글쓰기 과정(타이핑) 규칙 라벨 : 기존 edge function 로직 이식 ─────────────
def aggregate_process(entries: list[Entry]) -> dict[str, Any]:
    n = len(entries) or 1
    def s(getter):
        return sum(getter(e.process) for e in entries if e.process)
    total_chars = s(lambda p: p.charCount)
    total_time = s(lambda p: p.totalTimeMs)
    total_edits = s(lambda p: p.editCount + p.deleteCount)
    total_pause5 = s(lambda p: p.pause5sCount)

    avg_ms_per_char = total_time / total_chars if total_chars > 0 else 0
    avg_pause5 = total_pause5 / n
    edit_ratio = total_edits / total_chars if total_chars > 0 else 0

    if edit_ratio > 0.25:
        label = "수정 중심형"
        evidence = f"글 한 편당 평균 {round(total_edits / n)}회 정도 지우거나 고쳐 다듬으셨습니다."
    elif avg_ms_per_char > 1500 or avg_pause5 > 5:
        label = "사색형"
        sec = round(avg_ms_per_char / 100) / 10
        evidence = f"한 글자를 쓰기까지 평균 {sec:.1f}초가량 머무르며, 긴 침묵 구간이 자주 보입니다."
    else:
        label = "빠른 기록형"
        sec = round(avg_ms_per_char / 100) / 10
        evidence = f"한 글자당 평균 {sec:.1f}초로 비교적 빠르게 적어내려가셨습니다."

    return {
        "label": label,
        "evidence": evidence,
        "metrics": {
            "avgMsPerChar": avg_ms_per_char,
            "avgPause5": avg_pause5,
            "editRatio": edit_ratio,
            "totalEntries": n,
            "totalChars": total_chars,
        },
    }


# ── KoBERT 3축 집계 ───────────────────────────────────────────────────────
PROF_LABEL = {"H": "전문 지식형", "L": "생활 언어형"}
STYLE_LABEL = {"H": "격식·정제형", "L": "구어·편안형"}
SUBJ_LABEL = {"H": "주관·표현형", "L": "관찰·서술형"}


def _dominant(hl_list: list[str]) -> str:
    h = sum(1 for x in hl_list if x == "H")
    return "H" if h * 2 >= len(hl_list) else "L"


def aggregate_kobert(per_entry: list[dict]) -> dict[str, Any]:
    n = len(per_entry) or 1
    prof_hl = _dominant([r["전문성_HL"] for r in per_entry])
    style_hl = _dominant([r["어체_HL"] for r in per_entry])
    subj_hl = _dominant([r["주관성_HL"] for r in per_entry])

    prof_h = sum(1 for r in per_entry if r["전문성_HL"] == "H")
    style_h = sum(1 for r in per_entry if r["어체_HL"] == "H")
    subj_h = sum(1 for r in per_entry if r["주관성_HL"] == "H")

    mean_prof = round(sum(r["전문성_확률"] for r in per_entry) / n, 3)
    mean_style = round(sum(r["격식등급"] for r in per_entry) / n, 3)
    mean_subj = round(sum(r["주관성_score"] for r in per_entry) / n, 3)

    code = f"전문{prof_hl}_어체{style_hl}_주관{subj_hl}"
    name, desc = TYPE_NAMES.get(code, ("미정", ""))

    # 개별 글이 어떤 유형으로 판독됐는지 분포
    dist = Counter(r["유형명"] for r in per_entry)
    dist_str = ", ".join(f"{k} {v}편" for k, v in dist.most_common())

    return {
        "code": code,
        "typeName": name,
        "typeDesc": desc,
        "prof_hl": prof_hl,
        "style_hl": style_hl,
        "subj_hl": subj_hl,
        "counts": {"prof_H": prof_h, "style_H": style_h, "subj_H": subj_h, "n": n},
        "means": {"prof": mean_prof, "style": mean_style, "subj": mean_subj},
        "distribution": dist_str,
    }


def build_kobert_items(k: dict[str, Any], proc: dict[str, Any]) -> list[dict]:
    n = k["counts"]["n"]
    return [
        {
            "key": "writing_type",
            "label": k["typeName"],
            "evidence": f"{n}편 중 대표 유형은 ‘{k['typeName']}’입니다. (분포: {k['distribution']})",
            "meaning": k["typeDesc"],
        },
        {
            "key": "professionalism",
            "label": PROF_LABEL[k["prof_hl"]],
            "evidence": f"{n}편 중 {k['counts']['prof_H']}편이 전문성 높음으로 판독됐고, 평균 전문성 확률은 {k['means']['prof']}입니다.",
            "meaning": "",
        },
        {
            "key": "formality",
            "label": STYLE_LABEL[k["style_hl"]],
            "evidence": f"평균 격식 등급 {k['means']['style']} (1=하십시오체·0=반말). {n}편 중 {k['counts']['style_H']}편이 격식체 우세.",
            "meaning": "",
        },
        {
            "key": "subjectivity",
            "label": SUBJ_LABEL[k["subj_hl"]],
            "evidence": f"주관성 지표 평균 {k['means']['subj']} (1인칭·평가·확신·추측 종합). {n}편 중 {k['counts']['subj_H']}편이 주관 우세.",
            "meaning": "",
        },
        {
            "key": "process",
            "label": proc["label"],
            "evidence": proc["evidence"],
            "meaning": "",
        },
    ]


# ── Gemini "결과 정리" 단계 ────────────────────────────────────────────────
SUMMARY_SYSTEM = """당신은 한국어 글쓰기 분석 결과를 사용자에게 친절하게 "정리"해 주는 보조 도구입니다.

중요: 글의 유형 분류(전문성/어체/주관성/대표 유형)와 글쓰기 과정 라벨은 이미 별도 모델(KoBERT)과 규칙이 확정했습니다.
당신은 그 라벨을 절대 바꾸지 말고, 그대로 받아들여 (1) 각 항목의 의미 설명과 (2) 사용자 맞춤 AI 프롬프트를 작성하는 일만 합니다.

원칙:
- 결과는 심리 진단이나 성격 평가가 아니며, "이번 14일 글쓰기에서 나타난 경향"이라는 톤을 유지합니다.
- meaning(의미)은 각 항목이 사용자에게 무엇을 뜻하는지 1~2문장으로 부드럽게 풀어 씁니다.
- 프롬프트의 말투 관찰은 사용자의 실제 글 본문에서 근거를 찾습니다. 추측·단정은 피합니다.

[recommendedPrompt 작성 규칙]
목적: 사용자가 평소 쓰는 AI 챗봇(ChatGPT, Claude, Gemini 등)의 "시스템 프롬프트 / 커스텀 인스트럭션 / 메모리" 영역에 그대로 붙여넣으면 즉시 동작하는, 완성된 한 편의 한국어 시스템 프롬프트여야 합니다. 핵심 목적은 사용자의 고유한 글쓰기 방식을 AI에게 학습시켜, 모두가 비슷한 어투로 답하는 "인지적 동질화"에서 벗어나 사용자 본인의 문체로 사고·표현하도록 돕는 것입니다.

반드시 다음 마크다운 구조를 그대로 따릅니다 (헤더 텍스트도 동일하게):

# 역할
"당신은 ~을 돕는 글쓰기 파트너입니다." 형식의 한 문장. AI 자신은 "당신", 글의 주인은 "사용자"로 지칭합니다.

# 따라 할 말투
사용자의 14일치 글에서 관찰된 어휘·문장 리듬·종결어미 습관을 3~5개 불릿으로 정리합니다. 각 항목은 한 문장이며 가능하면 사용자가 실제로 쓴 짧은 예시를 따옴표로 인용합니다.

# 응답 원칙
3~4개 불릿. 다음을 포함: 위 "따라 할 말투"를 지킬 것 / 사용자가 직접 쓴 듯한 톤을 유지할 것 / "물론입니다!" 같은 AI다운 상투구를 피할 것 / KoBERT가 짚어준 유형 특성(전문성·어체·주관성)을 응답에서도 살릴 것.

# 보완 한 가지
KoBERT 판독에서 드러난 보완 지점을 한 문장으로 부드럽게. 뚜렷하지 않으면 생략 가능.

전체 분량은 마크다운 헤더 포함 약 350~700자. JSON string 값이므로 줄바꿈은 \\n 로 표현합니다.
[중요] recommendedPrompt 는 반드시 "# 역할" 마크다운 헤더로 시작합니다. 줄글로 시작하면 잘못된 출력입니다.

출력은 아래 JSON 스키마만, 코드펜스 없이 순수 JSON 한 덩어리로:
{
  "meanings": {
    "writing_type": "...",
    "professionalism": "...",
    "formality": "...",
    "subjectivity": "...",
    "process": "..."
  },
  "prompt_direction": { "label": "...", "evidence": "...", "meaning": "..." },
  "recommendedPrompt": "# 역할\\n...",
  "reasoning": "..."
}
- prompt_direction.label 후보: "문체 보존 글쓰기 코치" / "감정 구체화 코치" / "구조적 사고 코치" / "실천 설계 코치" 등 KoBERT 유형에 맞춰 선택.
- reasoning: 왜 이 프롬프트를 추천했는지 사용자에게 직접 말하는 어투로 3~5문장. 마크다운 없이 평문."""


def build_summary_user_msg(entries: list[Entry], k: dict, proc: dict) -> str:
    lines: list[str] = []
    lines.append("# KoBERT 3축 판독 결과 (확정 라벨 — 바꾸지 말 것)")
    lines.append(f"- 대표 유형: {k['typeName']} ({k['code']}) — {k['typeDesc']}")
    lines.append(f"- 전문성: {PROF_LABEL[k['prof_hl']]} (평균 확률 {k['means']['prof']})")
    lines.append(f"- 어체: {STYLE_LABEL[k['style_hl']]} (평균 격식등급 {k['means']['style']})")
    lines.append(f"- 주관성: {SUBJ_LABEL[k['subj_hl']]} (평균 지표 {k['means']['subj']})")
    lines.append(f"- 유형 분포: {k['distribution']}")
    lines.append("")
    lines.append("# 글쓰기 과정(타이핑) 라벨 (확정 — 바꾸지 말 것)")
    lines.append(f"- {proc['label']}: {proc['evidence']}")
    lines.append("")
    lines.append("# 14일치 사용자 글 (말투 근거로만 사용)")
    for e in entries:
        lines.append(f"\n## {e.date} ({e.type})")
        lines.append(e.content)
    return "\n".join(lines)


def call_gemini(system: str, user: str) -> str:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}"
    )
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
            "thinkingConfig": {"thinkingBudget": 1024},
        },
    }
    retryable = {429, 500, 502, 503, 504}
    last = ""
    for attempt in range(1, 4):
        r = requests.post(url, json=body, timeout=120)
        if r.ok:
            data = r.json()
            return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        last = f"{r.status_code} {r.text[:200]}"
        if r.status_code not in retryable or attempt == 3:
            break
        time.sleep(2 ** (attempt - 1))
    raise RuntimeError(f"Gemini error: {last}")


def safe_json(text: str) -> dict | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        i, j = text.find("{"), text.rfind("}")
        if i >= 0 and j > i:
            try:
                return json.loads(text[i : j + 1])
            except Exception:
                return None
    return None


def fallback_summary(k: dict, proc: dict) -> dict:
    """Gemini 키가 없을 때(로컬 개발) 파이프라인이 끊기지 않게 하는 규칙 기반 정리."""
    tone = "격식을 갖춘" if k["style_hl"] == "H" else "편안하고 구어적인"
    subj = "자기 감정과 관점을 적극적으로 드러내는" if k["subj_hl"] == "H" else "사실과 장면을 담담히 관찰하는"
    prompt = (
        "# 역할\n당신은 사용자의 글을 함께 다듬는 글쓰기 파트너입니다.\n\n"
        "# 따라 할 말투\n"
        f"- {tone} 말투를 사용합니다.\n"
        f"- {subj} 방식으로 씁니다.\n"
        f"- 대표 유형은 ‘{k['typeName']}’입니다: {k['typeDesc']}.\n\n"
        "# 응답 원칙\n"
        "- 위 말투를 그대로 지키며 응답합니다.\n"
        "- 사용자가 직접 쓴 듯한 톤을 유지합니다.\n"
        "- \"물론입니다!\" 같은 AI다운 상투구는 피합니다.\n"
    )
    return {
        "meanings": {
            "writing_type": k["typeDesc"],
            "professionalism": "전문 어휘와 개념 사용 정도를 나타냅니다.",
            "formality": "문장이 격식체에 가까운지 구어체에 가까운지를 나타냅니다.",
            "subjectivity": "감정·관점을 드러내는 정도를 나타냅니다.",
            "process": "글을 쓰는 동안의 리듬(속도·수정·멈춤)에서 나타난 특징입니다.",
        },
        "prompt_direction": {
            "label": "문체 보존 글쓰기 코치",
            "evidence": f"대표 유형 ‘{k['typeName']}’의 문체를 유지하도록 설계했습니다.",
            "meaning": "당신의 문체를 학습시켜 AI가 당신처럼 쓰도록 돕는 방향입니다.",
        },
        "recommendedPrompt": prompt,
        "reasoning": (
            f"이번 14일 글은 ‘{k['typeName']}’ 경향이 가장 뚜렷했어요. "
            "그 문체를 그대로 살리는 방향으로 프롬프트를 구성했습니다. "
            "(현재 서버에 Gemini 키가 없어 규칙 기반으로 정리했습니다.)"
        ),
        "_ai": "fallback",
    }


# ── 엔드포인트 ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "ok": True,
        "gemini": bool(GEMINI_KEY),
        "model": GEMINI_MODEL,
        "minEntries": MIN_ENTRIES,
        "maxEntries": MAX_ENTRIES,
        "testAccountConfigured": bool(TEST_ACCOUNT_EMAIL),
    }


@app.post("/predict")
def predict(req: PredictReq, x_analyze_token: str | None = Header(default=None)):
    """단일 텍스트 → KoBERT 하이브리드 판독 결과 JSON."""
    _check_token(x_analyze_token)
    return predict_one(req.text)


@app.post("/analyze")
def analyze(req: AnalyzeReq, x_analyze_token: str | None = Header(default=None)):
    _check_token(x_analyze_token)
    entries = [e for e in req.entries if (e.content or "").strip()]
    required = 1 if TEST_ACCOUNT_EMAIL and req.accountEmail.strip().lower() == TEST_ACCOUNT_EMAIL else MIN_ENTRIES
    if len(entries) < required:
        return {"error": f"{required}일치 글이 아직 모이지 않았어요.", "count": len(entries)}
    recent = entries[-MAX_ENTRIES:]

    # 1) KoBERT 개별 판독 + 집계
    per_entry = [predict_one(e.content) for e in recent]
    kagg = aggregate_kobert(per_entry)

    # 2) 글쓰기 과정(타이핑) 규칙 라벨
    proc = aggregate_process(recent)

    # 3) 항목 조립 (라벨/근거는 KoBERT·규칙이 확정)
    items = build_kobert_items(kagg, proc)

    # 4) Gemini "결과 정리" (의미 + 프롬프트 + 이유)
    user_msg = build_summary_user_msg(recent, kagg, proc)
    if GEMINI_KEY:
        raw = call_gemini(SUMMARY_SYSTEM, user_msg)
        parsed = safe_json(raw)
        if not parsed:
            return {"error": "AI 정리 응답을 파싱할 수 없습니다.", "raw": raw[:600]}
    else:
        parsed = fallback_summary(kagg, proc)
        raw = json.dumps(parsed, ensure_ascii=False)

    # meaning 채우기
    meanings = parsed.get("meanings", {})
    for it in items:
        if not it["meaning"]:
            it["meaning"] = meanings.get(it["key"], "")

    pd = parsed.get("prompt_direction", {})
    items.append(
        {
            "key": "prompt_direction",
            "label": pd.get("label", "문체 보존 글쓰기 코치"),
            "evidence": pd.get("evidence", ""),
            "meaning": pd.get("meaning", ""),
        }
    )

    return {
        "items": items,
        "recommendedPrompt": parsed.get("recommendedPrompt", ""),
        "reasoning": parsed.get("reasoning", ""),
        "_debug": {
            "model": GEMINI_MODEL if GEMINI_KEY else "kobert+fallback",
            "entryCount": len(recent),
            "kobert": kagg,
            "perEntry": per_entry,
            "processSummary": proc,
            "systemPrompt": SUMMARY_SYSTEM,
            "userMessage": user_msg,
            "rawResponse": raw,
        },
    }


if __name__ == "__main__":
    import uvicorn

    # 로컬은 127.0.0.1, 컨테이너/배포는 0.0.0.0 + $PORT
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    uvicorn.run(app, host=host, port=PORT)
