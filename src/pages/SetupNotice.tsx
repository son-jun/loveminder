export default function SetupNotice() {
  return (
    <div className="page leafy">
      <div className="page-header">
        <h1>이음 셋업이 필요해요</h1>
        <p className="sub">Supabase 환경 변수가 비어 있어 앱을 띄울 수 없습니다.</p>
      </div>
      <div className="page-body">
        <div className="card card-pad">
          <p className="muted" style={{ marginTop: 0 }}>
            프로젝트 루트에 <code>.env.local</code> 파일을 만들고 아래 두 값을 채워주세요.
          </p>
          <pre
            style={{
              background: 'var(--bg-elev)',
              padding: 'var(--sp-4)',
              borderRadius: 'var(--r-md)',
              fontSize: 13,
              overflowX: 'auto',
              lineHeight: 1.6,
            }}
          >{`VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}</pre>
          <p className="muted mt-4" style={{ fontSize: 13 }}>
            자세한 절차는 저장소의 <strong>README.md</strong>를 확인해주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
