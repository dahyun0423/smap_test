// 말로 길 묻기 — 사용자가 한 말을 출발·도착·이동 방식으로 해석한다.
// 앱이 후보 장소(최대 40곳)를 같이 보내고, Claude는 그 목록 안에서만 고른다 (없는 장소를 지어내지 않게).
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'

const Body = z.object({
  text: z.string().min(1).max(300),
  options: z.array(z.object({ id: z.string(), name: z.string(), sub: z.string().optional() })).max(60),
})

const Intent = z.object({
  to_id: z.string().nullable(),
  from_id: z.string().nullable(),
  avoid_stairs: z.boolean(),
  reply: z.string(),
})

const SYSTEM = `서경대학교 캠퍼스 길안내 앱의 음성 질문 해석기다.
사용자의 말에서 도착지와 출발지를 찾아 후보 목록의 id로만 답한다.
- 후보에 맞는 곳이 없으면 null. 목록에 없는 id를 만들지 않는다.
- "~에서", "~부터"가 붙은 곳이 출발지. 출발지를 말하지 않았으면 from_id는 null.
- 계단을 피하고 싶다는 말(계단 말고, 엘리베이터로, 휠체어, 짐, 배달 카트 등)이 있으면 avoid_stairs=true.
- 줄임말·별명을 이해한다: 학식=학생식당, 버정=버스정류장, 과사=학과사무실, 컴공=컴퓨터공학과.
- 장소 대신 할 일(졸업증명서 발급, 전공책 사기, 장학금 문의 등)을 말하면 후보의 '용무:' 설명을 보고 그 장소를 고른다. 이때 reply는 "졸업증명서는 교무처(혜인관 1층)에서 발급해요. 안내할게요."처럼 어디서 하는지 알려준다. 설명에 '담당 확인 중'이 있으면 reply 끝에 "담당 부서는 학교에 확인 중이에요"를 덧붙인다.
- 용무 설명이 없는 할 일은 추측해서 부서를 정하지 말고 null로 둔다.
- reply는 사용자에게 들려줄 한 문장 (예: "유담관까지 안내할게요." / 못 찾으면 "어느 건물인지 다시 말해 주세요.").`

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'llm_disabled' }, { status: 501 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'bad_request' }, { status: 400 })
  const { text, options } = parsed.data
  const ids = new Set(options.map((o) => o.id))
  const list = options.map((o) => `${o.id}\t${o.name}${o.sub ? `\t${o.sub}` : ''}`).join('\n')

  const client = new Anthropic({ timeout: 15_000, maxRetries: 1 })
  try {
    const res = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      // 안전 분류기가 거절하면 서버가 다른 모델로 다시 돌린다
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'low', format: betaZodOutputFormat(Intent) },
      messages: [{ role: 'user', content: `후보 장소 (id\t이름\t위치):\n${list}\n\n사용자의 말: "${text}"` }],
    })
    if (res.stop_reason === 'refusal' || !res.parsed_output) return Response.json({ error: 'no_answer' }, { status: 502 })
    const o = res.parsed_output
    // 목록 밖 id는 버린다
    return Response.json({
      to: o.to_id && ids.has(o.to_id) ? o.to_id : null,
      from: o.from_id && ids.has(o.from_id) ? o.from_id : null,
      avoidStairs: o.avoid_stairs,
      reply: o.reply,
    })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: 'rate_limited' }, { status: 429 })
    if (e instanceof Anthropic.APIError) return Response.json({ error: 'llm_error', status: e.status }, { status: 502 })
    return Response.json({ error: 'llm_unreachable' }, { status: 502 })
  }
}
