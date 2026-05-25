// Supabase Edge Function: analyze
// 14일치 일기를 모아 Google Gemini로 보내고, 6개 항목 분석 + 추천 프롬프트 + 이유를 생성.
// 기획서 7장 AI 연동 명세 기반. 결정사항: 추천 프롬프트는 "문체 모방 위주".

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.5-flash';
const geminiUrl = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ProcessData {
  totalTimeMs: number;
  activeTimeMs: number;
  charCount: number;
  sentenceCount: number;
  deleteCount: number;
  editCount: number;
  pause2sCount: number;
  pause5sCount: number;
  pasteCount: number;
  burstSegments: number[];
}

function aggregateProcess(entries: { process: ProcessData }[]) {
  const n = entries.length || 1;
  const totalChars = entries.reduce((a, e) => a + (e.process?.charCount ?? 0), 0);
  const totalTime = entries.reduce((a, e) => a + (e.process?.totalTimeMs ?? 0), 0);
  const totalEdits = entries.reduce(
    (a, e) => a + (e.process?.editCount ?? 0) + (e.process?.deleteCount ?? 0),
    0,
  );
  const totalPause5 = entries.reduce((a, e) => a + (e.process?.pause5sCount ?? 0), 0);

  const avgMsPerChar = totalChars > 0 ? totalTime / totalChars : 0;
  const avgPause5 = totalPause5 / n;
  const editRatio = totalChars > 0 ? totalEdits / totalChars : 0;

  let label: '빠른 기록형' | '사색형' | '수정 중심형';
  let evidence: string;
  if (editRatio > 0.25) {
    label = '수정 중심형';
    evidence = `글 한 편당 평균 ${Math.round(totalEdits / n)}회 정도 지우거나 고쳐 다듬으셨습니다.`;
  } else if (avgMsPerChar > 1500 || avgPause5 > 5) {
    label = '사색형';
    const seconds = Math.round(avgMsPerChar / 100) / 10;
    evidence = `한 글자를 쓰기까지 평균 ${seconds.toFixed(1)}초가량 머무르며, 긴 침묵 구간이 자주 보입니다.`;
  } else {
    label = '빠른 기록형';
    const seconds = Math.round(avgMsPerChar / 100) / 10;
    evidence = `한 글자당 평균 ${seconds.toFixed(1)}초로 비교적 빠르게 적어내려가셨습니다.`;
  }
  return {
    label,
    evidence,
    metrics: { avgMsPerChar, avgPause5, editRatio, totalEntries: n, totalChars },
  };
}

const SYSTEM_PROMPT = `당신은 한국어 글쓰기를 분석하여 "이번 14일에 나타난 글쓰기 경향"을 설명하는 보조 도구입니다.

원칙:
- 결과는 심리 진단이나 성격 평가가 아니며, "이번 글쓰기에서 나타난 경향"이라는 톤을 반드시 유지합니다.
- 사용자의 어휘·문체·리듬을 충실히 관찰합니다. 추측이나 단정은 피합니다.
- 모든 근거(evidence)는 사용자의 글 본문에서 직접 인용하거나 짧게 요약한 한국어 표현이어야 합니다.

다음 6개 항목을 모두 채워 JSON으로 출력합니다.

1) emotion_specificity — 감정 표현이 얼마나 구체적인지
   label 후보: "감정 미분화형" / "감정 표현형" / "감정 구체화형"
2) cause — 원인을 얼마나 탐색하는지
   label 후보: "단순 서술형" / "원인 탐색형"
3) attribution — 원인을 어디로 돌리는지
   label 후보: "자기비난형" / "구조적 원인 인식형" / "균형 귀인형"
4) alternative — 다음 행동/해결 방향을 제시하는지
   label 후보: "대안 부재형" / "대안 제시형" / "실천 선언형"
5) process — 글쓰기 과정 특징 (이미 시스템이 계산한 라벨을 그대로 사용)
6) prompt_direction — 위 1~5를 종합한 "추천 프롬프트의 방향"
   label 후보: "감정 구체화 프롬프트" / "구조적 사고 프롬프트" / "실천 설계 프롬프트" / "문체 보존 글쓰기 코치 프롬프트" 등

또한 다음을 함께 출력합니다.

[recommendedPrompt 작성 규칙]

목적: 사용자가 평소 사용하는 AI 챗봇(ChatGPT, Claude, Gemini 등)의 "시스템 프롬프트 / 커스텀 인스트럭션 / 메모리" 영역에 그대로 복사·붙여넣기만 하면 즉시 동작하는, 완성된 한 편의 한국어 시스템 프롬프트여야 합니다. 이 프롬프트의 핵심 목적은 사용자의 고유한 글쓰기 방식을 AI에게 학습시켜, 모두가 비슷한 어투로 답하는 "인지적 동질화" 현상에서 벗어나 사용자 본인의 문체로 사고·표현할 수 있도록 돕는 것입니다.

반드시 다음 마크다운 구조를 그대로 따릅니다 (헤더 텍스트도 동일하게):

# 역할
"당신은 ~을 돕는 글쓰기 파트너입니다." 형식으로 시작하는 한 문장.
- AI 자신은 "당신"으로 지칭합니다.
- 사용자(글의 주인)를 부를 때는 "사용자" 또는 호칭 없이 직접 말합니다.

# 따라 할 말투
사용자의 14일치 글에서 관찰된 어휘·문장 리듬·종결어미 습관을 3~5개의 불릿 항목으로 정리합니다. 각 항목은 한 문장으로, 가능하면 사용자가 실제로 쓴 짧은 예시(따옴표로 인용)를 함께 포함합니다.
예시 형식:
- 문장을 짧게 끊어 단문으로 씁니다. 예: "잠을 잘 못 잤다. 피곤하다."
- 감정을 표현할 때 "묘하게", "~인 것 같다" 같은 완곡한 표현을 자주 사용합니다.
- 결론을 단정하지 않고 "~려나", "~겠지" 같은 여운을 두는 종결어미를 씁니다.

# 응답 원칙
3~4개의 불릿 항목으로 작성합니다. 다음 내용을 반드시 포함합니다:
- 위 "따라 할 말투" 항목을 그대로 지키며 응답할 것.
- 사용자가 직접 쓴 듯한 톤을 유지할 것.
- 일반적인 "AI다운" 정중한 상투구(예: "물론입니다!", "도움이 되었으면 좋겠습니다") 사용을 피할 것.
- 사용자의 글에서 발견된 특유의 사고 패턴(예: 원인 탐색, 균형 잡힌 귀인 등)을 응답에서도 그대로 살릴 것.

# 보완 한 가지
1~5번 분석 항목에서 드러난 가장 두드러진 보완 지점을 한 문장으로 부드럽게 적습니다. 예: "단, 감정 표현이 '좋다/별로다'에 머무를 때는 그 안에 어떤 감정이 섞여 있는지 한 단계 더 풀어서 제안합니다."
보완할 점이 뚜렷하지 않으면 이 섹션을 생략해도 됩니다.

전체 분량은 마크다운 헤더 포함 약 350~700자.
JSON의 string 값으로 들어가야 하므로 줄바꿈은 \n 로 표현합니다.

[중요] recommendedPrompt는 반드시 "# 역할" 이라는 마크다운 헤더로 시작해야 합니다. 줄글 형태로 시작하는 출력은 잘못된 출력입니다. 다음 예시의 형식을 정확히 그대로 따라하세요 (내용은 사용자에 맞게 바꾸되, # 헤더 구조와 불릿 - 형식은 그대로 유지).

올바른 출력 예시 (recommendedPrompt 필드의 값):
"# 역할\n당신은 사용자의 일기를 함께 다듬는 글쓰기 파트너입니다.\n\n# 따라 할 말투\n- 문장을 짧게 끊어 단문으로 씁니다. 예: \"잠을 잘 못 잤다. 피곤하다.\"\n- 감정을 표현할 때 \"묘하게\", \"~인 것 같다\" 같은 완곡한 표현을 자주 사용합니다.\n- 결론을 단정하지 않고 \"~려나\", \"~겠지\" 같은 여운을 두는 종결어미를 씁니다.\n\n# 응답 원칙\n- 위 \"따라 할 말투\" 항목을 그대로 지키며 응답합니다.\n- 사용자가 직접 쓴 듯한 톤을 유지합니다.\n- \"물론입니다!\", \"도움이 되었으면 좋겠습니다\" 같은 AI다운 상투구는 피합니다.\n- 원인을 차분히 짚어가는 사용자의 사고 패턴을 응답에서도 살립니다.\n\n# 보완 한 가지\n단, 감정 표현이 \"좋다/별로다\"에 머무를 때는 그 안에 어떤 감정이 섞여 있는지 한 단계 더 풀어서 제안합니다."

잘못된 출력 예시 (이렇게 하지 마세요 — 줄글 형태):
"당신의 글쓰기 스타일을 모방하여, 생각과 감정을 더 깊이 탐색하는 글쓰기를 도와드리겠습니다. ..."

- reasoning: 왜 이 프롬프트를 추천했는지 사용자에게 직접 말하는 어투로 3~5문장. (마크다운 사용하지 말 것, 평문)

응답은 반드시 다음 JSON 스키마만 출력하세요. 다른 설명이나 마크다운, 코드펜스 없이 순수 JSON 한 덩어리만 출력하세요.

{
  "items": [
    { "key": "emotion_specificity", "label": "...", "evidence": "...", "meaning": "..." },
    { "key": "cause",               "label": "...", "evidence": "...", "meaning": "..." },
    { "key": "attribution",         "label": "...", "evidence": "...", "meaning": "..." },
    { "key": "alternative",         "label": "...", "evidence": "...", "meaning": "..." },
    { "key": "process",             "label": "...", "evidence": "...", "meaning": "..." },
    { "key": "prompt_direction",    "label": "...", "evidence": "...", "meaning": "..." }
  ],
  "recommendedPrompt": "...",
  "reasoning": "..."
}`;

function buildUserMessage(entries: any[], processSummary: ReturnType<typeof aggregateProcess>) {
  const lines: string[] = [];
  lines.push('# 14일치 사용자 글');
  for (const e of entries) {
    lines.push(`\n## ${e.date} (${e.type})`);
    lines.push(e.content);
  }
  lines.push('\n# 시스템이 계산한 글쓰기 과정 요약 (5번 항목용)');
  lines.push(`label: ${processSummary.label}`);
  lines.push(`evidence: ${processSummary.evidence}`);
  lines.push(`metrics: ${JSON.stringify(processSummary.metrics)}`);
  lines.push('\n위 5번 항목 라벨/근거는 그대로 사용하세요. 1~4번은 본문 근거로 직접 판단하고, 6번은 1~5번을 종합해 결정하세요.');
  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'missing auth' }, 401);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_KEY) return json({ error: 'GEMINI_API_KEY not configured' }, 500);

    // 호출자 인증 검증
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ures, error: uerr } = await userClient.auth.getUser();
    if (uerr || !ures.user) return json({ error: 'invalid user' }, 401);
    const userId = ures.user.id;

    // 데이터 적재는 service role로
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: entries, error: e1 } = await admin
      .from('diary_entries')
      .select('date, type, content, process')
      .eq('user_id', userId)
      .order('date', { ascending: true });
    if (e1) return json({ error: e1.message }, 500);
    if (!entries || entries.length < 14) {
      return json({ error: '14일치 글이 아직 모이지 않았어요.' }, 400);
    }

    const recent = entries.slice(-14);
    const processSummary = aggregateProcess(recent as any);

    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: buildUserMessage(recent, processSummary) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingBudget: 1024,
        },
      },
    };

    const r = await fetch(geminiUrl(GEMINI_KEY), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: `Gemini error: ${r.status} ${t.slice(0, 400)}` }, 502);
    }
    const geminiRes = await r.json();
    const text = geminiRes?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = safeParseJson(text);
    if (!parsed) {
      return json({ error: 'Gemini 응답을 파싱할 수 없습니다.', raw: text.slice(0, 600) }, 502);
    }

    // 5번 항목은 우리가 계산한 값으로 강제 정합
    const items = (parsed.items as any[]).map((it) => {
      if (it.key === 'process') {
        return {
          key: 'process',
          label: processSummary.label,
          evidence: processSummary.evidence,
          meaning: it.meaning ?? '',
        };
      }
      return it;
    });

    // 저장
    const { data: saved, error: e2 } = await admin
      .from('writing_analyses')
      .insert({
        user_id: userId,
        items,
        recommended_prompt: parsed.recommendedPrompt,
        reasoning: parsed.reasoning,
      })
      .select()
      .single();
    if (e2) return json({ error: e2.message }, 500);

    return json({
      id: saved.id,
      userId,
      items,
      recommendedPrompt: parsed.recommendedPrompt,
      reasoning: parsed.reasoning,
      createdAt: saved.created_at,
      _debug: {
        model: GEMINI_MODEL,
        systemPrompt: SYSTEM_PROMPT,
        userMessage: buildUserMessage(recent, processSummary),
        rawResponse: text,
        processSummary,
        entryCount: recent.length,
      },
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function safeParseJson(text: string): any | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
