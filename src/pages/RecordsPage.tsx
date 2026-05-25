import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { fetchEntries } from '../lib/diary';
import { formatNiceDate, weekdayLabel } from '../lib/date';
import { TOTAL_DAYS, type DiaryEntry } from '../types';

export default function RecordsPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchEntries(user.id).then(setEntries).catch(() => setEntries([]));
  }, [user]);

  const count = entries?.length ?? 0;
  const pct = Math.min(100, Math.round((count / TOTAL_DAYS) * 100));

  return (
    <div className="page">
      <div className="page-header">
        <h1>지금까지의 기록</h1>
        <p className="sub">14일 중 {Math.min(count, TOTAL_DAYS)}일 기록했어요</p>

        <div
          className="mt-4"
          style={{
            height: 6,
            background: 'var(--line-soft)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--sage-soft), var(--sage))',
              borderRadius: 999,
              transition: 'width 400ms ease',
            }}
          />
        </div>
      </div>

      <div className="page-body">
        {entries == null ? (
          <div style={{ paddingTop: 80, textAlign: 'center' }}>
            <span className="dots"><span /><span /><span /></span>
          </div>
        ) : entries.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
            <p style={{ margin: 0 }}>아직 작성한 글이 없어요.</p>
            <p className="mt-2 mute2" style={{ fontSize: 13, margin: 0 }}>
              오늘 탭에서 첫 글을 시작해보세요.
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--sp-3)' }}>
            {entries.map((e) => {
              const opened = open === e.id;
              const preview = e.content.replace(/\s+/g, ' ').slice(0, 64);
              return (
                <li key={e.id}>
                  <button
                    className="card card-pad"
                    onClick={() => setOpen(opened ? null : e.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'block',
                    }}
                  >
                    <div className="row between">
                      <span style={{ fontWeight: 500 }}>
                        {formatNiceDate(e.date)}{' '}
                        <span className="mute2" style={{ fontSize: 13 }}>
                          ({weekdayLabel(e.date)})
                        </span>
                      </span>
                      <span className="mute2" style={{ fontSize: 12 }}>{e.process.charCount}자</span>
                    </div>
                    <p
                      className="mt-2 muted"
                      style={{
                        margin: 0,
                        fontSize: 14,
                        display: opened ? 'block' : '-webkit-box',
                        WebkitLineClamp: opened ? undefined : 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        whiteSpace: opened ? 'pre-wrap' : 'normal',
                        lineHeight: 1.7,
                        fontFamily: opened ? 'var(--font-serif)' : 'inherit',
                      }}
                    >
                      {opened ? e.content : preview + (e.content.length > 64 ? '…' : '')}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
