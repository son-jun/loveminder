// 데이터 모델 (기획서 5장)

export type EntryType =
  | 'free'           // 자유 글쓰기
  | 'today'          // 오늘의 감정·경험 묘사
  | 'question'       // 특정 질문에 대한 답변
  | 'before_ai'      // 내재화 전
  | 'after_ai';      // 내재화 후

export interface ProcessData {
  totalTimeMs: number;
  activeTimeMs: number;
  charCount: number;
  sentenceCount: number;
  deleteCount: number;
  editCount: number;
  pause2sCount: number;
  pause5sCount: number;
  pasteCount: number;
  burstSegments: number[];
}

export interface DiaryEntry {
  id: string;
  userId: string;
  date: string;        // YYYY-MM-DD
  type: EntryType;
  content: string;
  process: ProcessData;
  createdAt: string;
  updatedAt: string;
}

// 6-3 6개 항목
export type AnalysisKey =
  | 'emotion_specificity'
  | 'cause'
  | 'attribution'
  | 'alternative'
  | 'process'
  | 'prompt_direction';

export interface AnalysisItem {
  key: AnalysisKey;
  label: string;
  evidence: string;
  meaning: string;
}

export interface AnalysisDebug {
  model: string;
  systemPrompt: string;
  userMessage: string;
  rawResponse: string;
  processSummary: unknown;
  entryCount: number;
}

export interface WritingAnalysis {
  id: string;
  userId: string;
  items: AnalysisItem[];
  recommendedPrompt: string;
  reasoning: string;
  createdAt: string;
  _debug?: AnalysisDebug;
}

export interface AppUser {
  id: string;
  email: string;
  createdAt: string;   // 가입일 = 일기 카운트 시작 기준
}

export const TOTAL_DAYS = 14;
