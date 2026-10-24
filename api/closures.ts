// 지금 못 가는 곳 — 관리자가 '반영됨'으로 바꾼 통행 불가 제보 중 기간이 남은 것. 앱이 길안내에서 이 지점들을 피한다.
import { neon } from '@neondatabase/serverless'
import { ensureFeedback } from './_lib/feedback-table.js'

export async function GET() {
  if (!process.env.DATABASE_URL) return Response.json({ rows: [] })
  const sql = neon(process.env.DATABASE_URL)
  await ensureFeedback(sql)
  const rows = await sql`SELECT id, node, type, until FROM feedback
    WHERE kind = 'closure' AND status = 'applied' AND (until IS NULL OR until >= current_date)
    ORDER BY created_at DESC`
  return Response.json({ rows }, { headers: { 'cache-control': 'public, max-age=60' } })
}
