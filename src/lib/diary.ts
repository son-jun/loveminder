import { supabase } from './supabase';
import type { DiaryEntry, EntryType, ProcessData, WritingAnalysis } from '../types';

type Row = {
  id: string;
  user_id: string;
  date: string;
  type: EntryType;
  content: string;
  process: ProcessData;
  created_at: string;
  updated_at: string;
};

function toEntry(r: Row): DiaryEntry {
  return {
    id: r.id,
    userId: r.user_id,
    date: r.date,
    type: r.type,
    content: r.content,
    process: r.process,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchEntries(userId: string): Promise<DiaryEntry[]> {
  const { data, error } = await supabase
    .from('diary_entries')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(toEntry);
}

export async function fetchEntryByDate(userId: string, date: string): Promise<DiaryEntry | null> {
  const { data, error } = await supabase
    .from('diary_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();
  if (error) throw error;
  return data ? toEntry(data as Row) : null;
}

export interface SaveEntryArgs {
  userId: string;
  date: string;
  type: EntryType;
  content: string;
  process: ProcessData;
}

export async function upsertEntry(args: SaveEntryArgs): Promise<DiaryEntry> {
  const payload = {
    user_id: args.userId,
    date: args.date,
    type: args.type,
    content: args.content,
    process: args.process,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('diary_entries')
    .upsert(payload, { onConflict: 'user_id,date' })
    .select()
    .single();
  if (error) throw error;
  return toEntry(data as Row);
}

// Onboarding flag
export async function hasSeenIntro(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('intro_seen_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.intro_seen_at);
}

export async function markIntroSeen(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ user_id: userId, intro_seen_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

// Analysis
type AnalysisRow = {
  id: string;
  user_id: string;
  items: WritingAnalysis['items'];
  recommended_prompt: string;
  reasoning: string;
  created_at: string;
};

export async function fetchAllAnalyses(userId: string): Promise<WritingAnalysis[]> {
  const { data, error } = await supabase
    .from('writing_analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as AnalysisRow[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    items: r.items,
    recommendedPrompt: r.recommended_prompt,
    reasoning: r.reasoning,
    createdAt: r.created_at,
  }));
}

export async function fetchLatestAnalysis(userId: string): Promise<WritingAnalysis | null> {
  const { data, error } = await supabase
    .from('writing_analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as AnalysisRow;
  return {
    id: r.id,
    userId: r.user_id,
    items: r.items,
    recommendedPrompt: r.recommended_prompt,
    reasoning: r.reasoning,
    createdAt: r.created_at,
  };
}

export async function saveAnalysis(args: {
  userId: string;
  items: WritingAnalysis['items'];
  recommendedPrompt: string;
  reasoning: string;
}): Promise<WritingAnalysis> {
  const { data, error } = await supabase
    .from('writing_analyses')
    .insert({
      user_id: args.userId,
      items: args.items,
      recommended_prompt: args.recommendedPrompt,
      reasoning: args.reasoning,
    })
    .select()
    .single();
  if (error) throw error;
  const r = data as AnalysisRow;
  return {
    id: r.id,
    userId: r.user_id,
    items: r.items,
    recommendedPrompt: r.recommended_prompt,
    reasoning: r.reasoning,
    createdAt: r.created_at,
  };
}

// Analyze via local KoBERT FastAPI server, then save the result to Supabase.
// (유형 판독은 KoBERT, 마지막 정리만 AI. 기존 Supabase edge function은 더 이상 쓰지 않음)
const ANALYZE_API =
  (import.meta.env.VITE_ANALYZE_API as string | undefined)?.replace(/\/$/, '') ??
  'http://127.0.0.1:8000';
const ANALYZE_TOKEN = import.meta.env.VITE_ANALYZE_TOKEN as string | undefined;

interface AnalyzeApiResponse {
  items?: WritingAnalysis['items'];
  recommendedPrompt?: string;
  reasoning?: string;
  error?: string;
  _debug?: WritingAnalysis['_debug'];
}

export async function requestAnalysis(userId: string): Promise<WritingAnalysis> {
  // 1) 최근 14편을 클라이언트에서 모아 서버로 전달 (서버는 DB 접근 없음)
  const all = await fetchEntries(userId); // date desc
  const recent = [...all].reverse().slice(-14); // date asc, 최근 14
  if (recent.length < 14) {
    throw new Error('14일치 글이 아직 모이지 않았어요.');
  }

  // 2) 로컬 KoBERT 서버 호출
  let res: Response;
  try {
    res = await fetch(`${ANALYZE_API}/analyze`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(ANALYZE_TOKEN ? { 'x-analyze-token': ANALYZE_TOKEN } : {}),
      },
      body: JSON.stringify({
        entries: recent.map((e) => ({
          date: e.date,
          type: e.type,
          content: e.content,
          process: e.process,
        })),
      }),
    });
  } catch {
    throw new Error(
      `분석 서버에 연결할 수 없어요. KoBERT 서버(${ANALYZE_API})가 실행 중인지 확인해 주세요.`,
    );
  }

  const data = (await res.json().catch(() => ({}))) as AnalyzeApiResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error || `분석 서버 오류 (${res.status})`);
  }
  if (!data.items || !data.recommendedPrompt) {
    throw new Error('분석 서버 응답이 올바르지 않습니다.');
  }

  // 3) 결과를 Supabase에 저장 (RLS: 본인 insert 허용 — migration 0004)
  const saved = await saveAnalysis({
    userId,
    items: data.items,
    recommendedPrompt: data.recommendedPrompt,
    reasoning: data.reasoning ?? '',
  });

  return { ...saved, _debug: data._debug };
}
