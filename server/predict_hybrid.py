# -*- coding: utf-8 -*-
"""하이브리드 자동 판독기 (3축 8유형, 어휘 제외).
  전문성 → 파인튜닝 KoBERT 모델 (사람점수 대체)
  어체   → 등급형 격식 규칙 (가장 강건, 정확도 ~0.96)
  주관성 → 1인칭·평가·확신·추측 규칙
  (어휘 축은 자동 다양성 지표로 안정 판독 불가하여 제외)
임계값은 사용자 라벨 216편으로 보정. 새 글 → 8유형 자동 판독.

사용:
  python predict_hybrid.py "본문..."            # 직접
  python predict_hybrid.py --csv 새글.csv --col 본문   # 일괄(결과 CSV 저장)
"""
import os, sys, json, argparse, warnings
warnings.filterwarnings("ignore")
import numpy as np, torch, torch.nn as nn
from transformers import AutoTokenizer, AutoModel
from kiwipiepy import Kiwi

BASE = os.path.dirname(os.path.abspath(__file__))
MD = os.path.join(BASE, "모델_자동판독")
cfg = json.load(open(os.path.join(MD, "config.json"), encoding="utf-8"))
P = json.load(open(os.path.join(MD, "hybrid_params.json"), encoding="utf-8"))
MODEL_NAME = cfg["model_name"]; MAX_LEN = cfg["max_len"]
device = "cuda" if torch.cuda.is_available() else "cpu"

kiwi = Kiwi()
tok = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)

class KoBERTMultiLabel(nn.Module):
    def __init__(self):
        super().__init__()
        self.bert = AutoModel.from_pretrained(MODEL_NAME, trust_remote_code=True)
        self.drop = nn.Dropout(0.1); self.head = nn.Linear(768, 4)
    def forward(self, input_ids, attention_mask):
        return self.head(self.drop(self.bert(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state[:, 0]))
clf = KoBERTMultiLabel().to(device)
clf.load_state_dict(torch.load(os.path.join(MD, "kobert_multilabel.pt"), map_location=device))
clf.eval()

# ---- 어휘/주관성 사전 (학습과 동일) ----
import json as _j
senti = _j.load(open(os.path.join(BASE, "SentiWord_info.json"), encoding="utf-8"))
EMO = set()
for e in senti:
    if e.get("polarity") in ("0", 0): continue
    w = (e.get("word_root") or e.get("word") or "").strip()
    if not any('가' <= c <= '힣' for c in w): continue
    if w: EMO.add(w)
    if w.endswith("다") and len(w) > 2: EMO.add(w[:-1])
DEGREE = {"정말","진짜","매우","너무","아주","굉장히","참","몹시","무척","특히","가장","제일","더욱","훨씬","상당히","꽤","되게","엄청","완전","정말로","무지"}
CERTAIN = {"분명히","확실히","반드시","당연히","물론","틀림없이","절대","꼭","결코","단연","명백히","확신","분명","확실","마땅히","당연"}
SPECUL = {"아마","어쩌면","혹시","아마도","글쎄","듯","같다","모르다","보이다","싶다","추측","아무래도"}
FIRST = {"나","내","저","제","우리","저희","본인"}
FORMAL_EF = ("니다","니까","ㅂ니다","습니다")
W = 50

def z(x, ms): return (x - ms[0]) / ms[1]

def formal_graded(toks):
    """등급형 격식(어체): 하십시오체1.0·한다체0.8·해요체0.3·반말0.0 평균. AUC 0.999."""
    ef = [t for t in toks if t.tag == "EF"]
    if not ef:
        return P["style_graded_median"]   # EF 없으면 중립
    s = 0.0
    for t in ef:
        f = t.form
        if ("니다" in f) or ("니까" in f) or f.endswith(("십시오", "ㅂ시다")): s += 1.0
        elif f.endswith("요"): s += 0.3
        elif f.endswith("다"): s += 0.8
        else: s += 0.0
    return s/len(ef)

def kiwi_features(text):
    toks = kiwi.tokenize(text) if text else []
    n = len(toks) or 1
    ct = [t.form for t in toks if t.tag[0] in ("N","V") or t.tag in ("MAG","MAJ")]
    # 어휘 = MATTR 단독 (의미분산 제거: AUC 0.82 vs 0.70)
    if len(ct) <= W:
        mattr = len(set(ct))/len(ct) if ct else 0.0
    else:
        mattr = float(np.mean([len(set(ct[i:i+W]))/W for i in range(len(ct)-W+1)]))
    # 어체 = 등급형 격식 단독 (KoBERT 앵커 제거: AUC 0.99 vs 0.72)
    style = formal_graded(toks)
    first = sum(1 for t in toks if t.form in FIRST and t.tag[0]=="N")/n
    evalp = (sum(1 for t in toks if (t.tag[0] in ("N","V") or t.tag=="MAG") and t.form in EMO)
             + sum(1 for t in toks if t.tag in ("MAG","MAJ") and t.form in DEGREE))/n
    cert = sum(1 for t in toks if t.form in CERTAIN)/n
    spec = (sum(1 for t in toks if t.tag=="EP" and "겠" in t.form) + sum(1 for t in toks if t.form in SPECUL))/n
    return mattr, style, first, evalp, cert, spec


@torch.no_grad()
def 전문성_model(text):
    enc = tok([text], return_tensors="pt", truncation=True, max_length=MAX_LEN, padding=True)
    enc = {k: v.to(device) for k, v in enc.items() if k in ("input_ids","attention_mask")}
    return float(torch.sigmoid(clf(**enc))[0, 0].cpu())   # 전문성 = 0번 축

# 사용자 보정 임계값(216편 보정)
TH_PROF = P.get("cal_전문성", 0.5)
TH_STYLE = P.get("cal_어체", P["style_graded_median"])
TH_SUBJ = P.get("cal_주관성", P["median_주관"])

# 8유형 이름·설명 (전문성·어체·주관성)
TYPE_NAMES = {
    "전문H_어체H_주관H": ("논점 설계자", "전문 지식을 바탕으로 자기 관점을 세우고 글의 방향을 주도하는 유형"),
    "전문H_어체H_주관L": ("개념 건축가", "복잡한 내용을 차분히 구조화해 독자가 이해할 수 있게 쌓아 올리는 유형"),
    "전문H_어체L_주관H": ("지식 번역가", "어려운 내용을 자기 말로 풀어내며 해석과 의견을 곁들이는 유형"),
    "전문H_어체L_주관L": ("교양 안내자", "전문 정보를 부담 없는 말투로 전달해 독자의 진입 장벽을 낮추는 유형"),
    "전문L_어체H_주관H": ("내면 기록가", "일상의 경험을 차분한 문장으로 정리하며 자기 감정과 생각을 들여다보는 유형"),
    "전문L_어체H_주관L": ("하루 관찰자", "일상의 흐름을 감정보다 사실과 장면 중심으로 담담하게 남기는 유형"),
    "전문L_어체L_주관H": ("감정 발화자", "편한 말투로 자기 감정과 반응을 직접적으로 드러내는 유형"),
    "전문L_어체L_주관L": ("순간 채집가", "가벼운 어조로 일상의 장면과 사건을 빠르게 포착해 남기는 유형"),
}

def predict_one(text):
    t = kiwi.space(str(text).strip())
    mattr, style, first, evalp, cert, spec = kiwi_features(t)
    # 어체 = 격식등급 단독 (사용자 보정 임계)
    어체_HL = "H" if style >= TH_STYLE else "L"
    # 주관성 = 1인칭+평가+확신+추측
    주관_raw = (z(first, P["first"]) + z(evalp, P["eval"]) + z(cert, P["cert"]) + z(spec, P["spec"]))/4
    축주관 = z(주관_raw, P["raw_주관"])
    주관_HL = "H" if 축주관 >= TH_SUBJ else "L"
    # 전문성 = 파인튜닝 모델
    p_prof = 전문성_model(t)
    전문성_HL = "H" if p_prof >= TH_PROF else "L"
    code = f"전문{전문성_HL}_어체{어체_HL}_주관{주관_HL}"   # 3축 8유형 (어휘 제외)
    name, desc = TYPE_NAMES.get(code, ("미정", ""))
    return {"유형명": name, "유형설명": desc, "유형코드": code,
            "전문성_HL": 전문성_HL, "어체_HL": 어체_HL, "주관성_HL": 주관_HL,
            "전문성_확률": round(p_prof, 4), "격식등급": round(style, 4), "주관성_score": round(float(축주관), 3),
            "참고_MATTR(어휘제외)": round(mattr, 4)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text", nargs="?"); ap.add_argument("--csv"); ap.add_argument("--col", default="본문")
    a = ap.parse_args()
    if a.csv:
        import pandas as pd
        d = pd.read_csv(a.csv, encoding="utf-8-sig")
        rows = [predict_one(x) for x in d[a.col].fillna(" ").astype(str)]
        out = pd.concat([d.reset_index(drop=True), pd.DataFrame(rows)], axis=1)
        op = os.path.splitext(a.csv)[0] + "_하이브리드판독.csv"
        out.to_csv(op, index=False, encoding="utf-8-sig"); print("저장:", op)
    elif a.text:
        print(json.dumps(predict_one(a.text), ensure_ascii=False, indent=2))
    else:
        print("텍스트나 --csv 를 입력하세요.")

if __name__ == "__main__":
    main()
