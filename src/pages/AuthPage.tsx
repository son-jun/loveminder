import { useState } from 'react';
import Icon from '../components/Icon';
import { useAuth } from '../lib/auth';
import { TOTAL_DAYS } from '../types';

type View =
  | { kind: 'form' }
  | { kind: 'confirmSent'; email: string };

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [view, setView] = useState<View>({ kind: 'form' });
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      // 이메일 미인증 케이스를 더 친절하게
      if (/email.+not.+confirmed/i.test(error) || /Email not confirmed/i.test(error)) {
        setErr('아직 이메일 인증이 안 끝났어요. 메일함을 확인해 인증 링크를 눌러주세요.');
      } else if (/invalid.+credentials/i.test(error)) {
        setErr('이메일 또는 비밀번호가 정확하지 않아요.');
      } else if (/already.+registered/i.test(error) || /User already registered/i.test(error)) {
        setErr('이미 가입된 이메일이에요. 로그인 탭에서 들어가주세요.');
      } else {
        setErr(error);
      }
      return;
    }
    if (mode === 'signup') {
      setView({ kind: 'confirmSent', email: email.trim() });
    }
  };

  if (view.kind === 'confirmSent') {
    return <ConfirmSentView email={view.email} onBack={() => setView({ kind: 'form' })} />;
  }

  return (
    <div className="page leafy">
      <div className="page-header">
        <h1 className="serif">이음</h1>
        <p className="sub">{TOTAL_DAYS}일간의 글이 나만의 AI 프롬프트가 됩니다.</p>
      </div>
      <div className="page-body" style={{ paddingTop: 24 }}>
        <div className="card card-pad">
          <div className="row gap-2" style={{ marginBottom: 'var(--sp-5)' }}>
            <button
              type="button"
              className="btn"
              onClick={() => { setMode('signin'); setErr(null); }}
              style={{
                padding: '8px 14px',
                background: mode === 'signin' ? 'var(--sage-bg)' : 'transparent',
                color: mode === 'signin' ? 'var(--sage)' : 'var(--ink-soft)',
                fontSize: 14,
              }}
            >
              로그인
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => { setMode('signup'); setErr(null); }}
              style={{
                padding: '8px 14px',
                background: mode === 'signup' ? 'var(--sage-bg)' : 'transparent',
                color: mode === 'signup' ? 'var(--sage)' : 'var(--ink-soft)',
                fontSize: 14,
              }}
            >
              회원가입
            </button>
          </div>

          <form onSubmit={submit}>
            <label className="label" htmlFor="email">이메일</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="mt-4">
              <label className="label" htmlFor="password">비밀번호</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              {mode === 'signup' && (
                <p className="mute2 mt-2" style={{ fontSize: 12, margin: '6px 0 0' }}>
                  6자 이상
                </p>
              )}
            </div>
            {err && (
              <p className="mt-3" style={{ color: 'var(--terracotta)', fontSize: 13 }}>
                {err}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block mt-5" disabled={busy}>
              {busy ? '잠시만요…' : mode === 'signin' ? '로그인' : '가입하기'}
            </button>
          </form>
        </div>

        <p className="muted mt-5" style={{ fontSize: 12, textAlign: 'center' }}>
          이음은 글쓰기 결과·과정을 바탕으로 <br /> 이번 {TOTAL_DAYS}일의 경향을 보여줍니다.
        </p>
      </div>
    </div>
  );
}

function ConfirmSentView({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="page leafy">
      <div className="page-header">
        <h1 className="serif">메일을 보냈어요</h1>
        <p className="sub">한 단계만 더 진행하면 시작할 수 있어요.</p>
      </div>
      <div className="page-body" style={{ paddingTop: 24 }}>
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
            <Icon name="check" size={26} />
          </div>
          <h2 className="serif mt-3" style={{ margin: 0, fontSize: 'var(--fs-20)' }}>
            인증 메일을 확인해주세요
          </h2>
          <p className="muted mt-3" style={{ fontSize: 14, lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--ink)' }}>{email}</strong> 로<br />
            인증 링크를 보냈어요.<br />
            메일을 열어 <strong style={{ color: 'var(--ink)' }}>"Confirm your email"</strong> 버튼을 누르면 가입이 완료됩니다.
          </p>

          <div
            className="mt-5"
            style={{
              padding: '12px 14px',
              background: 'var(--bg-elev)',
              borderRadius: 'var(--r-md)',
              fontSize: 12,
              lineHeight: 1.7,
              color: 'var(--ink-soft)',
              textAlign: 'left',
            }}
          >
            <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 500 }}>메일이 안 보이나요?</p>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>스팸함을 확인해보세요.</li>
              <li>이메일 주소가 정확한지 확인해주세요.</li>
              <li>몇 분 뒤에 다시 시도해보세요.</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="btn btn-ghost btn-block mt-5"
          >
            다른 메일로 다시 가입하기
          </button>
        </div>

        <p className="muted mt-5" style={{ fontSize: 12, textAlign: 'center' }}>
          인증을 마쳤다면 다시 돌아와 로그인해주세요.
        </p>
      </div>
    </div>
  );
}
