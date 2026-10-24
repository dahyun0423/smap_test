// 사진 속 화살표 방향 보정값 — 보정 모드(?edit=1)에서 저장하면 모든 사용자에게 바로 반영된다.
// (예전엔 브라우저에만 저장 → JSON 복사 → src/data/yaw.json에 붙여넣고 재배포해야 했음)
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { z } from 'zod'

const Body = z.record(z.string().regex(/^[a-z0-9_]+>[a-z0-9_]+$/), z.number().min(-360).max(360))

const ensure = async (sql: NeonQueryFunction<false, false>) => {
  await sql`CREATE TABLE IF NOT EXISTS link_yaw (link text PRIMARY KEY, yaw real NOT NULL, updated_at timestamptz DEFAULT now())`
}

export async function GET() {
  if (!process.env.DATABASE_URL) return Response.json({})
  const sql = neon(process.env.DATABASE_URL)
  await ensure(sql)
  const rows = (await sql`SELECT link, yaw FROM link_yaw`) as { link: string; yaw: number }[]
  return Response.json(Object.fromEntries(rows.map((r) => [r.link, r.yaw])), { headers: { 'cache-control': 'public, max-age=60' } })
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: 'db_disabled' }, { status: 501 })
  const admin = process.env.ADMIN_KEY
  if (!admin || request.headers.get('x-admin-key') !== admin) return Response.json({ error: 'forbidden' }, { status: 403 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'bad_request' }, { status: 400 })
  const sql = neon(process.env.DATABASE_URL)
  await ensure(sql)
  const entries = Object.entries(parsed.data)
  for (const [link, yaw] of entries) {
    await sql`INSERT INTO link_yaw (link, yaw) VALUES (${link}, ${yaw})
      ON CONFLICT (link) DO UPDATE SET yaw = EXCLUDED.yaw, updated_at = now()`
  }
  return Response.json({ ok: true, saved: entries.length })
}
