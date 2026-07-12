# 이음 KoBERT 분석 서버 — 배포용 이미지 (CPU 추론)
FROM python:3.11-slim

# torch 런타임에 필요한 libgomp
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    HF_HOME=/app/.cache/huggingface \
    PORT=7860

WORKDIR /app

# 1) CPU 전용 torch 먼저 (기본 인덱스는 CUDA판이라 이미지가 커짐)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# 2) 나머지 의존성 (torch 는 이미 충족)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3) KoBERT 베이스 가중치를 빌드 시 미리 받아 이미지에 캐시 (콜드스타트 단축)
RUN python -c "from transformers import AutoTokenizer, AutoModel; \
AutoTokenizer.from_pretrained('skt/kobert-base-v1', trust_remote_code=True); \
AutoModel.from_pretrained('skt/kobert-base-v1', trust_remote_code=True)"

# 4) 서버 코드 + 자산 복사
#    (kobert_multilabel.pt 가 빌드 컨텍스트에 있으면 함께 복사됨.
#     없으면 런타임에 MODEL_URL 로 내려받는다 — app.py _ensure_model)
COPY . .

EXPOSE 7860
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-7860}"]
