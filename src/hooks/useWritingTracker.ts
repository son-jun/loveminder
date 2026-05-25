// 기획서 6-1(B): 글쓰기 과정 데이터 수집 훅
// 결정 메모: "수정 횟수(editCount)" = "이미 입력된 구간 중간을 고친 횟수"
//  - 끝(append)에 글자 추가는 editCount에 포함하지 않는다.
//  - Backspace로 끝을 지우는 것은 deleteCount에는 포함하되 editCount 아님.
//  - 커서가 텍스트 끝이 아닐 때 들어오는 입력/삭제만 editCount로 본다.
// 결정 메모: paste는 onPaste에서 preventDefault로 무조건 차단.
//  - 다른 글을 가져와 분석을 우회하는 것을 막기 위해.
//  - 드래그앤드롭 등 다른 경로로 한 번에 큰 텍스트가 들어오는 것도
//    onChange 단계에서 burstChunkLimit으로 차단한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProcessData } from '../types';

interface TrackerState extends ProcessData {
  startedAtMs: number | null;
  lastKeyAtMs: number | null;
  burstStartAtMs: number | null;
  burstCharCount: number;
  prevLen: number;
}

export type BlockedReason = 'paste' | 'burst';

interface Options {
  /** 한 번에 차단할 입력 변화량 (글자 수). 사람 손으로는 도달 불가능한 값. */
  burstChunkLimit?: number;
  /** 차단 발생 시 호출되는 콜백. UI에서 토스트 등으로 안내. */
  onBlocked?: (reason: BlockedReason) => void;
}

const initial = (): TrackerState => ({
  totalTimeMs: 0,
  activeTimeMs: 0,
  charCount: 0,
  sentenceCount: 0,
  deleteCount: 0,
  editCount: 0,
  pause2sCount: 0,
  pause5sCount: 0,
  pasteCount: 0,
  burstSegments: [],
  startedAtMs: null,
  lastKeyAtMs: null,
  burstStartAtMs: null,
  burstCharCount: 0,
  prevLen: 0,
});

const IDLE_MS = 5000;
const PAUSE_2 = 2000;
const PAUSE_5 = 5000;
const BURST_MIN_CHARS = 8;

function countSentences(text: string): number {
  if (!text.trim()) return 0;
  const matches = text.match(/[.!?…。！？]+/g);
  const punctCount = matches ? matches.length : 0;
  return Math.max(punctCount, 1);
}

export function useWritingTracker(initialContent: string = '', options: Options = {}) {
  const { burstChunkLimit = 80, onBlocked } = options;
  const [text, setText] = useState(initialContent);
  const stateRef = useRef<TrackerState>({
    ...initial(),
    prevLen: initialContent.length,
    charCount: initialContent.length,
  });
  const [, setBump] = useState(0);
  const force = useCallback(() => setBump((n) => (n + 1) % 1000), []);

  const endBurst = useCallback(() => {
    const s = stateRef.current;
    if (s.burstStartAtMs != null && s.burstCharCount >= BURST_MIN_CHARS) {
      s.burstSegments.push(s.burstCharCount);
    }
    s.burstStartAtMs = null;
    s.burstCharCount = 0;
  }, []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      const target = e.target;
      const now = Date.now();
      const s = stateRef.current;

      const prev = s.prevLen;
      const lenDelta = next.length - prev;

      // 큰 덩어리 입력 차단 (붙여넣기 외 경로: 드래그앤드롭, 자동완성 등)
      if (lenDelta > burstChunkLimit) {
        onBlocked?.('burst');
        // 컨트롤드 컴포넌트라 setText를 호출하지 않으면 이전 텍스트가 유지됨
        force();
        return;
      }

      if (s.startedAtMs == null) {
        s.startedAtMs = now;
      }
      if (s.lastKeyAtMs != null) {
        const gap = now - s.lastKeyAtMs;
        if (gap >= PAUSE_5) {
          s.pause5sCount += 1;
          s.pause2sCount += 1;
          endBurst();
        } else if (gap >= PAUSE_2) {
          s.pause2sCount += 1;
        }
        s.activeTimeMs += Math.min(gap, IDLE_MS);
      }

      const cursorAt = target.selectionStart ?? next.length;
      const cursorAtEnd = cursorAt >= next.length - 0;

      if (lenDelta < 0) {
        s.deleteCount += 1;
        if (cursorAt < next.length) {
          s.editCount += 1;
        }
        endBurst();
      } else if (lenDelta > 0) {
        const insertedAtEnd = cursorAtEnd && cursorAt === next.length;
        if (!insertedAtEnd) {
          s.editCount += 1;
        }
        if (insertedAtEnd) {
          if (s.burstStartAtMs == null) {
            s.burstStartAtMs = now;
            s.burstCharCount = lenDelta;
          } else {
            s.burstCharCount += lenDelta;
          }
        } else {
          endBurst();
        }
      }

      s.prevLen = next.length;
      s.charCount = next.length;
      s.sentenceCount = countSentences(next);
      s.lastKeyAtMs = now;
      s.totalTimeMs = now - s.startedAtMs;

      setText(next);
      force();
    },
    [endBurst, force, burstChunkLimit, onBlocked],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      // 다른 글을 그대로 가져와 분석을 우회하는 것을 막기 위해
      // 붙여넣기는 입력 자체를 차단한다.
      e.preventDefault();
      const s = stateRef.current;
      s.pasteCount += 1;
      endBurst();
      force();
      onBlocked?.('paste');
    },
    [endBurst, force, onBlocked],
  );

  const reset = useCallback(
    (content: string = '') => {
      stateRef.current = { ...initial(), prevLen: content.length, charCount: content.length };
      setText(content);
      force();
    },
    [force],
  );

  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current;
      if (s.startedAtMs != null) {
        s.totalTimeMs = Date.now() - s.startedAtMs;
        force();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [force]);

  const snapshot = (): ProcessData => {
    const s = stateRef.current;
    const burstSegments = [...s.burstSegments];
    if (s.burstStartAtMs != null && s.burstCharCount >= BURST_MIN_CHARS) {
      burstSegments.push(s.burstCharCount);
    }
    return {
      totalTimeMs: s.totalTimeMs,
      activeTimeMs: s.activeTimeMs,
      charCount: s.charCount,
      sentenceCount: s.sentenceCount,
      deleteCount: s.deleteCount,
      editCount: s.editCount,
      pause2sCount: s.pause2sCount,
      pause5sCount: s.pause5sCount,
      pasteCount: s.pasteCount,
      burstSegments,
    };
  };

  return { text, setText, onChange, onPaste, reset, snapshot };
}
