import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../lib/auth';
import { fetchEntries, requestAnalysis } from '../lib/diary';
import { advanceCycle, computeCycleState, getCycleStart } from '../lib/cycle';
import { TOTAL_DAYS, type WritingAnalysis } from '../types';

const ANALYZING_STEPS = [
  '14일치 일기를 모으는 중…',
  '글쓰기 과정 데이터를 정리하는 중…',
  'AI에게 분석을 요청하는 중…',
  '여섯 가지 관찰을 정리하는 중…',
  '문체에 맞춘 프롬프트를 다듬는 중…',
];

type Status =
  | { kind: 'loading' }
  | { kind: 'locked'; daysWritten: number }
  | { kind: 'ready'; daysWritten: number }
  | { kind: 'analyzing' }
  | { kind: 'justDone'; result: WritingAnalysis }
  | { kind: 'error'; message: string };

export default function AnalysisPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [cycleStart, entries] = await Promise.all([
          getCycleStart(user.id),
          fetchEntries(user.id),
        ]);
        const state = computeCycleState(
          cycleStart,
          entries.map((e) => e.date),
        );
        if (state.isComplete) {
          setStatus({ kind: 'ready', daysWritten: state.daysWritten });
        } else {
          setStatus({ kind: 'locked', daysWritten: state.daysWritten });
        }
      } catch (e) {
        setStatus({ kind: 'error', message: (e as Error).message });
      }
    })();
  }, [user]);

  const runAnalysis = async () => {
    if (!user) return;
    setStatus({ kind: 'analyzing' });
    try {
      const r = await requestAnalysis(user.id);
      // 분석 완료 → 사이클은 내일부터 새로 1일차
      await advanceCycle(user.id).catch(() => {});
      setStatus({ kind: 'justDone', result: r });
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>나의 글쓰기 분석</h1>
        <p className="sub">14일치가 모이면 이 화면에서 분석을 시작할 수 있어요.</p>
      </div>

      <div className="page-body">
        {status.kind === 'loading' && (
          <div style={{ paddingTop: 80, textAlign: 'center' }}>
            <span className="dots"><span /><span /><span /></span>
          </div>
        )}

        {status.kind === 'error' && (
          <div className="card card-pad" style={{ color: 'var(--terracotta)' }}>
            <p style={{ margin: 0 }}>문제가 생겼어요</p>
            <p className="mt-2 muted" style={{ fontSize: 13, margin: 0 }}>{status.message}</p>
          </div>
        )}

        {status.kind === 'locked' && <LockedView daysWritten={status.daysWritten} />}

        {status.kind === 'ready' && (
          <div className="card card-pad" style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                background: 'var(--sage-bg)',
                color: 'var(--sage)',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto',
              }}
            >
              <Icon name="sparkle" size={26} />
            </div>
            <h2 className="serif mt-3" style={{ margin: 0, fontSize: 'var(--fs-20)' }}>
              14일치 글이 모였어요
            </h2>
            <p className="muted mt-2" style={{ fontSize: 14 }}>
              지금 분석을 시작하면 자기성찰 리포트와 나만의 AI 프롬프트가 만들어져요.
              <br />결과는 <strong>프롬프트 탭</strong>에 저장되고, 그 다음 날부터 새로운 14일이 시작됩니다.
            </p>
            <button className="btn btn-primary btn-block mt-5" onClick={runAnalysis}>
              분석 시작하기
            </button>
          </div>
        )}

        {status.kind === 'analyzing' && <AnalyzingView />}

        {status.kind === 'justDone' && <JustDoneView result={status.result} />}
      </div>
    </div>
  );
}

function AnalyzingView() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => Math.min(s + 1, ANALYZING_STEPS.length - 1));
    }, 1800);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="card card-pad" style={{ textAlign: 'center' }}>
      <span className="dots"><span /><span /><span /></span>
      <p className="serif mt-4" style={{ margin: 0, fontSize: 16, color: 'var(--ink)' }}>
        {ANALYZING_STEPS[step]}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--sp-4) 0 0', display: 'grid', gap: 6 }}>
        {ANALYZING_STEPS.map((label, i) => (
          <li
            key={i}
            className="row gap-2"
            style={{
              justifyContent: 'center',
              fontSize: 12,
              color: i < step ? 'var(--sage)' : i === step ? 'var(--ink-soft)' : 'var(--ink-mute)',
            }}
          >
            {i < step ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}
            <span>{label}</span>
          </li>
        ))}
      </ul>
      <p className="mute2 mt-5" style={{ margin: 0, fontSize: 11 }}>
        보통 10~20초 정도 걸려요.
      </p>
    </div>
  );
}

function JustDoneView({ result }: { result: WritingAnalysis }) {
  return (
    <div className="card card-pad leafy" style={{ textAlign: 'center' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 999,
          background: 'var(--sage-bg)',
          color: 'var(--sage)',
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto',
        }}
      >
        <Icon name="check" size={28} />
      </div>
      <h2 className="serif mt-3" style={{ margin: 0, fontSize: 'var(--fs-20)' }}>
        이번 사이클의 분석이 완성됐어요
      </h2>
      <p className="muted mt-2" style={{ fontSize: 14, lineHeight: 1.7 }}>
        결과는 <strong style={{ color: 'var(--ink)' }}>프롬프트</strong> 탭에 저장됐어요.
        <br />내일부터 새로운 14일이 1일차부터 시작됩니다.
      </p>
      <Link to="/prompts" className="btn btn-primary btn-block mt-5">
        <Icon name="arrow" size={16} />
        프롬프트 탭에서 보기
      </Link>
      <p className="mute2 mt-3" style={{ fontSize: 12 }}>
        오늘 막 분석한 결과: <strong>{result.items[0]?.label}</strong> 등 6개 관찰
      </p>
    </div>
  );
}

function LockedView({ daysWritten }: { daysWritten: number }) {
  const left = Math.max(0, TOTAL_DAYS - daysWritten);
  return (
    <div className="card card-pad leafy" style={{ textAlign: 'center' }}>
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
        <Icon name="lock" size={26} />
      </div>
      <h2 className="serif mt-3" style={{ margin: 0, fontSize: 'var(--fs-20)' }}>
        앞으로 {left}일 더 쓰면 분석이 열려요
      </h2>
      <p className="muted mt-2" style={{ fontSize: 14 }}>
        이번 사이클에서 {daysWritten}일치를 적어주셨어요. 매일의 글이 분석의 재료가 됩니다.
      </p>
      <div
        className="mt-5"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${TOTAL_DAYS}, 1fr)`,
          gap: 6,
        }}
      >
        {Array.from({ length: TOTAL_DAYS }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 8,
              borderRadius: 4,
              background: i < daysWritten ? 'var(--sage)' : 'var(--line-soft)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
