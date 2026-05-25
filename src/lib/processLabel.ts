// 기획서 6-3 항목 5번: 글쓰기 과정 특징 라벨 결정.
// 결정 메모: 임계값은 14일치 entries 평균을 기준으로 잡는다.
//  - "사색형": 평균 totalTimeMs/charCount(글자당 체류 시간) 상위 + pause5sCount 상위
//  - "빠른 기록형": 글자당 체류 시간 하위 + edit/delete 비율 낮음
//  - "수정 중심형": editCount + deleteCount 합이 charCount 대비 비율 상위
// 우선 한 항목 라벨만 출력. (multi-label은 추후)

import type { ProcessData } from '../types';

export type ProcessLabel = '빠른 기록형' | '사색형' | '수정 중심형';

export interface ProcessAggregate {
  label: ProcessLabel;
  metrics: {
    avgMsPerChar: number;
    avgPause5: number;
    editRatio: number;
    totalChars: number;
    totalEntries: number;
  };
  evidence: string;
}

export function aggregateProcess(entries: ProcessData[]): ProcessAggregate {
  const n = entries.length || 1;
  const totalChars = entries.reduce((a, e) => a + e.charCount, 0);
  const totalTime = entries.reduce((a, e) => a + e.totalTimeMs, 0);
  const totalEdits = entries.reduce((a, e) => a + e.editCount + e.deleteCount, 0);
  const totalPause5 = entries.reduce((a, e) => a + e.pause5sCount, 0);

  const avgMsPerChar = totalChars > 0 ? totalTime / totalChars : 0;
  const avgPause5 = totalPause5 / n;
  const editRatio = totalChars > 0 ? totalEdits / totalChars : 0;

  // 임계값(기획서 11장 "결정 필요" — 우선 합리적 기본값 사용)
  //  msPerChar:  >1500 사색 / <400 빠름
  //  avgPause5:  >5 사색
  //  editRatio:  >0.25 수정 중심
  let label: ProcessLabel;
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
    evidence = `한 글자당 평균 ${seconds.toFixed(1)}초로 비교적 빠르게 떠오르는 대로 적어내려가셨습니다.`;
  }

  return {
    label,
    metrics: { avgMsPerChar, avgPause5, editRatio, totalChars, totalEntries: n },
    evidence,
  };
}
