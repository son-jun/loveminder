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

// Analyze via edge function
export async function requestAnalysis(userId: string): Promise<WritingAnalysis> {
  const { data, error } = await supabase.functions.invoke('analyze', {
    body: { userId },
  });
  if (error) {
    // Try to extract server-side error body for richer messaging
    let detail = '';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.text === 'function') {
        const bodyText = await ctx.text();
        try {
          const parsed = JSON.parse(bodyText);
          detail = parsed.error || parsed.message || bodyText;
        } catch {
          detail = bodyText.slice(0, 400);
        }
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail ? `${error.message} — ${detail}` : error.message);
  }
  return data as WritingAnalysis;
}
