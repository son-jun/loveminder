import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import PromptView from '../components/PromptView';
import { useAuth } from '../lib/auth';
import { fetchAllAnalyses } from '../lib/diary';
import type { AnalysisKey, WritingAnalysis } from '../types';

const ITEM_NAMES: Record<AnalysisKey, string> = {
  // KoBERT 3축 8유형
  writing_type: '대표 글쓰기 유형',
  professionalism: '전문성',
  formality: '어체(격식)',
  subjectivity: '주관성',
  // 규칙 기반
  process: '글쓰기 과정 특징',
  // AI 정리
  prompt_direction: 'AI 프롬프트 활용 방향',
  // (구) 과거 레코드 호환
  emotion_specificity: '감정 표현의 구체성',
  cause: '원인 탐색',
  attribution: '귀인 방식',
  alternative: '대안 제시',
};

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return formatDateLong(iso);
}

export default function PromptsPage() {
  const { user } = useAuth();
  const [list, setList] = useState<WritingAnalysis[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    fetchAllAnalyses(user.id)
      .then(setList)
      .catch(() => setList([]));
  }, [user]);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>나만의 프롬프트</h1>
        <p className="sub">
          {list && list.length > 0
            ? `지금까지 ${list.length}편의 프롬프트가 모였어요`
            : '14일 사이클마다 한 편씩 쌓여요'}
        </p>
      </div>

      <div className="page-body">
        {list == null ? (
          <div style={{ paddingTop: 80, textAlign: 'center' }}>
            <span className="dots"><span /><span /><span /></span>
          </div>
        ) : list.length === 0 ? (
          <EmptyState />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--sp-5)' }}>
            {list.map((a, idx) => {
              const isLatest = idx === 0;
              const open = !!expanded[a.id];
              return (
                <li key={a.id} className="col" style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                  <div className="row between" style={{ padding: '0 var(--sp-1)' }}>
                    <span className="mute2" style={{ fontSize: 12 }}>
                      {formatDateLong(a.createdAt)} · {formatRelative(a.createdAt)}
                    </span>
                    {isLatest && (
                      <span
                        className="chip"
                        style={{ background: 'var(--terracotta-bg)', color: 'var(--terracotta)' }}
                      >
                        가장 최근
                      </span>
                    )}
                  </div>

                  {/* 상세 분석 토글 */}
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => ({ ...s, [a.id]: !s[a.id] }))}
                    className="card card-pad row between"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: open ? '#FBF7EE' : 'var(--bg-card)',
                    }}
                  >
                    <div>
                      <p className="mute2" style={{ margin: 0, fontSize: 12 }}>자기성찰 리포트</p>
                      <p className="serif mt-2" style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>
                        상세 분석 내용 보기
                      </p>
                    </div>
                    <Icon name={open ? 'close' : 'arrow'} size={16} />
                  </button>

                  {open && <AnalysisDetail analysis={a} />}

                  {/* 추천 프롬프트 */}
                  <section className="card card-pad" style={{ background: '#FFFBF6' }}>
                    <div className="row between">
                      <span className="chip chip-warm">추천 프롬프트</span>
                      <button
                        type="button"
                        className="row gap-2"
                        onClick={() => copy(a.id, a.recommendedPrompt)}
                        style={{
                          fontSize: 13,
                          color: copiedId === a.id ? 'var(--sage)' : 'var(--ink-soft)',
                        }}
                      >
                        <Icon name={copiedId === a.id ? 'check' : 'copy'} size={16} />
                        {copiedId === a.id ? '복사됨' : '복사'}
                      </button>
                    </div>
                    <p className="mute2 mt-3" style={{ margin: 0, fontSize: 12 }}>
                      ChatGPT·Claude·Gemini의 시스템 프롬프트 또는 커스텀 인스트럭션 영역에 그대로 붙여넣으세요.
                    </p>
                    <div className="mt-3">
                      <PromptView text={a.recommendedPrompt} />
                    </div>
                  </section>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card card-pad" style={{ textAlign: 'center' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 999,
          background: 'var(--bg-elev)',
          color: 'var(--ink-mute)',
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto',
        }}
      >
        <Icon name="sparkle" size={26} />
      </div>
      <h2 className="serif mt-3" style={{ margin: 0, fontSize: 'var(--fs-18)' }}>
        아직 만든 프롬프트가 없어요
      </h2>
      <p className="muted mt-2" style={{ fontSize: 13 }}>
        오늘 탭에서 14일치 일기를 모으고
        <br />분석 탭에서 분석을 시작해보세요.
      </p>
    </div>
  );
}

function AnalysisDetail({ analysis }: { analysis: WritingAnalysis }) {
  return (
    <section
      className="card card-pad"
      style={{
        background: '#FBF7EE',
        animation: 'fade 200ms ease',
      }}
    >
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--sp-4)' }}>
        {analysis.items.map((it) => (
          <li key={it.key}>
            <p
              className="mute2"
              style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              {ITEM_NAMES[it.key] ?? it.key}
            </p>
            <p className="mt-2" style={{ margin: 0 }}>
              <span className="chip">{it.label}</span>
            </p>
            {it.evidence && (
              <p
                className="mt-2"
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: 'var(--ink-soft)',
                  borderLeft: '2px solid var(--sage-soft)',
                  paddingLeft: 10,
                }}
              >
                {it.evidence}
              </p>
            )}
            {it.meaning && (
              <p className="mt-2 muted" style={{ margin: 0, fontSize: 13 }}>{it.meaning}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="divider" />
      <p className="mute2" style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        왜 이 프롬프트인가요?
      </p>
      <p className="muted mt-2" style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
        {analysis.reasoning}
      </p>
    </section>
  );
}
