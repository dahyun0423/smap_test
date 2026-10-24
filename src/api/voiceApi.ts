import { postJson } from '@/api/client';
import type { Place } from '@/data/campus';

export interface AiIntent {
  to: string | null;
  from: string | null;
  avoidStairs: boolean;
  reply: string;
}

/** 문장 → 출발·도착 (Claude). 넘겨준 후보 장소 안에서만 고른다 */
export function parseWithAI(text: string, options: Place[]) {
  const candidates = options.map((p) => ({ id: p.id, name: p.name, sub: p.sub }));
  return postJson<AiIntent>('/api/parse', { text, options: candidates }, 12000);
}

/** 녹음 → 텍스트 (Whisper) */
export async function transcribe(audio: Blob): Promise<string | null> {
  try {
    const r = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'content-type': audio.type || 'audio/webm' },
      body: audio,
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return null;
    return ((await r.json()) as { text: string }).text || null;
  } catch {
    return null;
  }
}
