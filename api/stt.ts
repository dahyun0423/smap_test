// 서버 음성인식 — 브라우저가 녹음한 파일을 OpenAI Whisper로 글자로 바꾼다.
// 브라우저 음성인식(Web Speech)보다 야외 소음·아이폰에 강하다.
const MAX_BYTES = 4 * 1024 * 1024 // Vercel 함수 요청 한도(4.5MB) 안쪽
// 캠퍼스 고유명사를 알려주면 인식률이 오른다
const PROMPT = '서경대학교 유담관 북악관 문예관 대일관 상승관 청운관 혜인관 은주1관 은주2관 한림관 본관 수인관 학생식당 버스정류장 스콘스퀘어 폭풍의언덕 교수님 연구실'

export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return Response.json({ error: 'stt_disabled' }, { status: 501 })
  const type = request.headers.get('content-type') ?? 'audio/webm'
  const audio = await request.arrayBuffer()
  if (!audio.byteLength) return Response.json({ error: 'empty' }, { status: 400 })
  if (audio.byteLength > MAX_BYTES) return Response.json({ error: 'too_large' }, { status: 413 })

  const ext = type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm'
  const form = new FormData()
  form.append('file', new Blob([audio], { type }), `voice.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'ko')
  form.append('prompt', PROMPT)

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null)
  if (!res) return Response.json({ error: 'stt_unreachable' }, { status: 502 })
  if (!res.ok) return Response.json({ error: 'stt_error', status: res.status }, { status: 502 })
  const data = (await res.json()) as { text?: string }
  return Response.json({ text: (data.text ?? '').trim() })
}
