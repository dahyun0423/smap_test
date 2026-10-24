// 제보 — DB에 저장하고 Claude가 유형·긴급도를 분류한다.
// 종류: issue(정보가 틀려요) · closure(지금 못 가요 — 관리자가 '반영'하면 길안내에서 그 지점을 피함) · course(더 좋은 길) · praise(정확해요)
// GET: 관리자 키 → 전체(관리자 화면 ?admin=1) / ?cid=기기id → 내 제보 현황
// PATCH: 관리자 키 → 처리 상태 변경 (받음 → 확인 중 → 반영됨 / 반려)
import Anthropic from '@anthropic-ai/sdk'
import { neon } from '@neondatabase/serverless'
import { ensureFeedback as ensure } from './_lib/feedback-table.js'
import { z } from 'zod'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'

const KINDS = ['issue', 'closure', 'course', 'praise'] as const
const STATUSES = ['received', 'checking', 'applied', 'rejected'] as const

const Body = z.object({
  kind: z.enum(KINDS).default('issue'),
  node: z.string().max(80),
  step: z.number().int().nullable().optional(),
  type: z.string().max(80).nullable().optional(),
  memo: z.string().max(1000).optional(),
  cid: z.string().max(64).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fromNode: z.string().max(80).optional(),
  toNode: z.string().max(80).optional(),
  tags: z.array(z.string().max(30)).max(8).optional(),
  photo: z.string().max(300).optional(),
})

const Patch = z.object({ id: z.number().int(), status: z.enum(STATUSES) })

const Triage = z.object({
  category: z.enum(['사진·설명 불일치', '방향 화살표 오류', '연결 경로 오류', '층 안내 부족', '통로 이용 불가', '길 제보', '기타']),
  severity: z.number().int().min(1).max(3),
  action: z.string(),
})

const db = () => neon(process.env.DATABASE_URL!)
const isAdmin = (request: Request) => !!process.env.ADMIN_KEY && request.headers.get('x-admin-key') === process.env.ADMIN_KEY

async function triage(r: z.infer<typeof Body>) {
  if (!process.env.ANTHROPIC_API_KEY || r.kind === 'praise') return null
  const client = new Anthropic({ timeout: 15_000, maxRetries: 1 })
  const what = {
    issue: '안내 정보가 틀리거나 헷갈림',
    closure: '지금 이 지점을 지나갈 수 없음 (실시간 통행 불가)',
    course: '사용자가 더 좋은 길(코스)을 제안함',
  }[r.kind]
  try {
    const res = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: '서경대 360° 캠퍼스 길안내 앱에 들어온 사용자 제보를 분류한다. severity: 3=길을 잃게 만듦(경로·통로 오류, 통행 불가), 2=헷갈림(방향·층 안내), 1=사소함. action은 팀이 할 일 한 줄 (예: "이 지점 재촬영", "화살표 방향 보정", "현장 확인 후 통행 불가 반영"). 지점이 home이면 지점 없이 들어온 제보라 내용에서 장소를 찾는다. 새 길·지름길 제안은 "길 제보".',
      output_config: { effort: 'low', format: betaZodOutputFormat(Triage) },
      messages: [{
        role: 'user',
        content: [
          `제보 종류: ${what}`,
          `지점: ${r.node}`,
          r.fromNode ? `코스: ${r.fromNode} → ${r.toNode ?? '?'}` : '',
          r.tags?.length ? `코스 태그: ${r.tags.join(', ')}` : '',
          r.until ? `통행 불가 예상 기간: ${r.until}까지` : '',
          `선택한 유형: ${r.type ?? '없음'}`,
          `내용: ${r.memo || '없음'}`,
          r.photo ? '사진 첨부 있음' : '',
        ].filter(Boolean).join('\n'),
      }],
    })
    return res.stop_reason === 'refusal' ? null : res.parsed_output
  } catch {
    return null // 분류 실패해도 접수는 저장
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: 'db_disabled' }, { status: 501 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'bad_request' }, { status: 400 })
  const r = parsed.data
  const ai = await triage(r)
  const sql = db()
  await ensure(sql)
  const rows = await sql`INSERT INTO feedback (kind, node, step, type, memo, cid, until, from_node, to_node, tags, photo, ai_category, ai_severity, ai_action)
    VALUES (${r.kind}, ${r.node}, ${r.step ?? null}, ${r.type ?? null}, ${r.memo ?? null}, ${r.cid ?? null}, ${r.until ?? null},
      ${r.fromNode ?? null}, ${r.toNode ?? null}, ${r.tags ?? null}, ${r.photo ?? null},
      ${ai?.category ?? null}, ${ai?.severity ?? null}, ${ai?.action ?? null})
    RETURNING id`
  return Response.json({ ok: true, id: (rows[0] as { id: number }).id })
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: 'db_disabled' }, { status: 501 })
  const sql = db()
  await ensure(sql)
  const cid = new URL(request.url).searchParams.get('cid')
  if (cid && !isAdmin(request)) {
    // 내 제보 현황 — 이 기기에서 보낸 것만, 관리용 정보(AI 메모) 없이
    const rows = await sql`SELECT id, created_at, kind, node, type, memo, status, until, from_node, to_node, tags, (photo IS NOT NULL) AS has_photo, updated_at
      FROM feedback WHERE cid = ${cid} ORDER BY created_at DESC LIMIT 50`
    return Response.json({ rows })
  }
  if (!isAdmin(request)) return Response.json({ error: 'forbidden' }, { status: 403 })
  const rows = await sql`SELECT * FROM feedback ORDER BY created_at DESC LIMIT 500`
  return Response.json({ rows })
}

export async function PATCH(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: 'db_disabled' }, { status: 501 })
  if (!isAdmin(request)) return Response.json({ error: 'forbidden' }, { status: 403 })
  const parsed = Patch.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'bad_request' }, { status: 400 })
  const sql = db()
  await ensure(sql)
  await sql`UPDATE feedback SET status = ${parsed.data.status}, updated_at = now() WHERE id = ${parsed.data.id}`
  return Response.json({ ok: true })
}
