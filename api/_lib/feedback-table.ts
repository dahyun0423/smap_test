// 제보 테이블 — feedback·closures 함수가 같이 쓴다 (_lib 폴더는 Vercel 함수로 배포되지 않음)
import type { NeonQueryFunction } from '@neondatabase/serverless'

export const ensureFeedback = async (sql: NeonQueryFunction<false, false>) => {
  await sql`CREATE TABLE IF NOT EXISTS feedback (
    id serial PRIMARY KEY, created_at timestamptz DEFAULT now(),
    node text NOT NULL, step int, type text, memo text,
    ai_category text, ai_severity int, ai_action text)`
  // 2026-10-09 제보 확장
  await sql`ALTER TABLE feedback
    ADD COLUMN IF NOT EXISTS kind text DEFAULT 'issue',
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'received',
    ADD COLUMN IF NOT EXISTS cid text,
    ADD COLUMN IF NOT EXISTS until date,
    ADD COLUMN IF NOT EXISTS from_node text,
    ADD COLUMN IF NOT EXISTS to_node text,
    ADD COLUMN IF NOT EXISTS tags text[],
    ADD COLUMN IF NOT EXISTS photo text,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz`
}

