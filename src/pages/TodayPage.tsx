import { useEffect, useMemo, useRef, useState } from 'react';
import IntroModal from '../components/IntroModal';
import Icon from '../components/Icon';
import { useAuth } from '../lib/auth';
import {
  fetchEntries,
  fetchEntryByDate,
  hasSeenIntro,
  markIntroSeen,
  upsertEntry,
} from '../lib/diary';
import { todayKey, formatNiceDate, weekdayLabel } from '../lib/date';
import { computeCycleState, getCycleStart } from '../lib/cycle';
import { useWritingTracker, type BlockedReason } from '../hooks/useWritingTracker';
import { TOTAL_DAYS, type DiaryEntry } from '../types';

const BLOCK_MESSAGES: Record<BlockedReason, string> = {
  paste: '붙여넣기는 사용할 수 없어요. 직접 적어 내려간 글로 분석해야 정확한 결과가 나옵니다.',
  burst: '한 번에 너무 많은 글자가 들어왔어요. 천천히 직접 적어주세요.',
};

export default function TodayPage() {
  const { user, signOut } = useAuth();
  const [intro, setIntro] = useState(false);
  const [existingToday, setExistingToday] = useState<DiaryEntry | null>(null);
  const [dayNumber, setDayNumber] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [blockNotice, setBlockNotice] = useState<string | null>(null);
  const blockTimeoutRef = useRef<number | null>(null);
  const tracker = useWritingTracker('', {
    onBlocked: (reason) => {
      setBlockNotice(BLOCK_MESSAGES[reason]);
      if (blockTimeoutRef.current) window.clearTimeout(blockTimeoutRef.current);
      blockTimeoutRef.current = window.setTimeout(() => setBlockNotice(null), 3500);
    },
  });
  const today = todayKey();

  useEffect(() => () => {
    if (blockTimeoutRef.current) window.clearTimeout(blockTimeoutRef.current);
  }, []);

  // Load intro + existing today + day count (현재 사이클 기준)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const seen = await hasSeenIntro(user.id).catch(() => false);
      if (!cancelled && !seen) setIntro(true);

      const todays = await fetchEntryByDate(user.id, today).catch(() => null);
      if (!cancelled && todays) {
        setExistingToday(todays);
        tracker.reset(todays.content);
      }

      const [cycleStart, all] = await Promise.all([
        getCycleStart(user.id).catch(() => today),
        fetchEntries(user.id).catch<DiaryEntry[]>(() => []),
      ]);
      // dayNumber는 사이클 시작일 기준의 "오늘이 며칠째인가" — 14로 cap
      const state = computeCycleState(cycleStart, all.map((e) => e.date), today);
      if (!cancelled) setDayNumber(Math.min(state.dayNumber, TOTAL_DAYS));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, today]);

  const onIntroOk = async () => {
    setIntro(false);
    if (user) await markIntroSeen(user.id).catch(() => {});
  };

  const onSave = async () => {
    if (!user) return;
    if (tracker.text.trim().length < 10) {
      alert('조금만 더 적어볼까요? (최소 10자)');
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertEntry({
        userId: user.id,
        date: today,
        type: 'today',
        content: tracker.text,
        process: tracker.snapshot(),
      });
      setExistingToday(saved);
      setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      alert('저장 중 문제가 생겼어요: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const meta = useMemo(() => tracker.snapshot(), [tracker.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const niceDate = `${formatNiceDate(today)} (${weekdayLabel(today)})`;

  return (
    <div className="page leafy">
      <div className="page-header">
        <div className="row between">
          <span className="chip">{TOTAL_DAYS}일 중 {dayNumber}일째</span>
          <button
            type="button"
            onClick={signOut}
            className="row gap-2"
            style={{ color: 'var(--ink-mute)', fontSize: 12 }}
          >
            <Icon name="logout" size={16} /> 로그아웃
          </button>
        </div>
        <h1 className="mt-3">오늘의 이야기를 적어보세요</h1>
        <p className="sub">{niceDate} · 떠오르는 대로 자유롭게</p>
      </div>

      <div className="page-body">
        {blockNotice && (
          <div
            role="status"
            style={{
              marginBottom: 'var(--sp-3)',
              padding: '10px 14px',
              background: 'var(--terracotta-bg)',
              color: 'var(--terracotta)',
              borderRadius: 'var(--r-md)',
              fontSize: 13,
              lineHeight: 1.55,
              animation: 'fade 180ms ease',
            }}
          >
            {blockNotice}
          </div>
        )}
        <div className="card card-pad">
          <textarea
            value={tracker.text}
            onChange={tracker.onChange}
            onPaste={tracker.onPaste}
            placeholder={'오늘 하루는 어땠나요?\n어떤 일이 있었고, 그때 어떻게 느꼈는지 천천히 적어보세요.'}
            rows={10}
            style={{
              width: '100%',
              minHeight: 280,
              resize: 'vertical',
              lineHeight: 1.8,
              fontSize: 15,
              fontFamily: 'var(--font-serif)',
              color: 'var(--ink)',
              background: 'transparent',
            }}
          />
          <div className="divider" />
          <div className="row between" style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
            <span>
              {meta.charCount}자 · {meta.sentenceCount}문장
            </span>
            <span>
              {Math.floor(meta.totalTimeMs / 60000)}분 {Math.floor((meta.totalTimeMs % 60000) / 1000)}초
            </span>
          </div>
        </div>

        <button
          className="btn btn-primary btn-block mt-5"
          onClick={onSave}
          disabled={saving || tracker.text.trim().length < 10}
        >
          {saving ? '저장하는 중…' : existingToday ? '오늘의 글 수정하기' : '오늘의 글 저장'}
        </button>
        {savedAt && (
          <p className="mt-3 muted" style={{ fontSize: 12, textAlign: 'center' }}>
            방금 {savedAt}에 저장되었어요.
          </p>
        )}
        {existingToday && !savedAt && (
          <p className="mt-3 muted" style={{ fontSize: 12, textAlign: 'center' }}>
            오늘 작성한 글이 있어요. 수정하면 새 내용으로 덮어써집니다.
          </p>
        )}
      </div>

      {intro && <IntroModal onConfirm={onIntroOk} />}
    </div>
  );
}
