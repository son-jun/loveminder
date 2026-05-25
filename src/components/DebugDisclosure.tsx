import { useState } from 'react';
import type { AnalysisDebug } from '../types';

interface Props {
  debug: AnalysisDebug;
}

export default function DebugDisclosure({ debug }: Props) {
  const [open, setOpen] = useState<'none' | 'sent' | 'raw'>('none');

  return (
    <section className="card card-pad" style={{ background: '#FBF7EE' }}>
      <p className="mute2" style={{ margin: 0, fontSize: 12 }}>AI 분석 과정</p>
      <p className="muted mt-2" style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
        분석은 <strong style={{ color: 'var(--ink)' }}>{debug.model}</strong>로 진행되었고, 14일치 일기 중
        가장 최근 <strong style={{ color: 'var(--ink)' }}>{debug.entryCount}편</strong>이 함께 보내졌어요.
      </p>

      <div className="row gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setOpen(open === 'sent' ? 'none' : 'sent')}
          className="chip"
          style={{
            background: open === 'sent' ? 'var(--sage)' : 'var(--sage-bg)',
            color: open === 'sent' ? '#fff' : 'var(--sage)',
            cursor: 'pointer',
          }}
        >
          AI에게 보낸 정보
        </button>
        <button
          type="button"
          onClick={() => setOpen(open === 'raw' ? 'none' : 'raw')}
          className="chip"
          style={{
            background: open === 'raw' ? 'var(--terracotta)' : 'var(--terracotta-bg)',
            color: open === 'raw' ? '#fff' : 'var(--terracotta)',
            cursor: 'pointer',
          }}
        >
          AI 원본 응답
        </button>
      </div>

      {open === 'sent' && (
        <div className="mt-4">
          <p className="mute2" style={{ margin: 0, fontSize: 12 }}>1) 시스템 프롬프트 (AI의 역할 지시)</p>
          <DebugBlock>{debug.systemPrompt}</DebugBlock>
          <p className="mute2 mt-4" style={{ margin: 0, fontSize: 12 }}>2) 사용자 메시지 (14일치 글 + 과정 메트릭)</p>
          <DebugBlock>{debug.userMessage}</DebugBlock>
        </div>
      )}

      {open === 'raw' && (
        <div className="mt-4">
          <p className="mute2" style={{ margin: 0, fontSize: 12 }}>AI가 그대로 뱉은 JSON 응답</p>
          <DebugBlock>{prettyJson(debug.rawResponse)}</DebugBlock>
        </div>
      )}
    </section>
  );
}

function DebugBlock({ children }: { children: string }) {
  return (
    <pre
      style={{
        marginTop: 8,
        marginBottom: 0,
        padding: 'var(--sp-3) var(--sp-4)',
        background: '#FFFCF6',
        border: '1px solid var(--line-soft)',
        borderRadius: 'var(--r-md)',
        fontSize: 12,
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: 320,
        overflow: 'auto',
        color: 'var(--ink-soft)',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
      }}
    >
      {children}
    </pre>
  );
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
