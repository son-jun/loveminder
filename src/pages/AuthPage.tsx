import { useState } from 'react';
import { useAuth } from '../lib/auth';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    if (mode === 'signup') {
      setInfo('가입 메일을 확인해 인증을 마쳐주세요. 인증 후 로그인할 수 있어요.');
    }
  };

  return (
    <div className="page leafy">
      <div className="page-header">
        <h1 className="serif">이음</h1>
        <p className="sub">14일간의 글이 나만의 AI 프롬프트가 됩니다.</p>
      </div>
      <div className="page-body" style={{ paddingTop: 24 }}>
        <div className="card card-pad">
          <div className="row gap-2" style={{ marginBottom: 'var(--sp-5)' }}>
            <button
              type="button"
              className="btn"
              onClick={() => setMode('signin')}
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
              onClick={() => setMode('signup')}
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
            </div>
            {err && (
              <p className="mt-3" style={{ color: 'var(--terracotta)', fontSize: 13 }}>
                {err}
              </p>
            )}
            {info && (
              <p className="mt-3" style={{ color: 'var(--sage)', fontSize: 13 }}>
                {info}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block mt-5" disabled={busy}>
              {busy ? '잠시만요…' : mode === 'signin' ? '로그인' : '가입하기'}
            </button>
          </form>
        </div>

        <p className="muted mt-5" style={{ fontSize: 12, textAlign: 'center' }}>
          이음은 글쓰기 결과·과정을 바탕으로 <br /> 이번 14일의 경향을 보여줍니다.
        </p>
      </div>
    </div>
  );
}
