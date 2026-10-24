// 서버 기능이 켜져 있는지 앱에 알려준다. 키가 없으면 앱은 기존(브라우저) 방식으로 동작.
export function GET() {
  return Response.json({
    llm: !!process.env.ANTHROPIC_API_KEY, // 문장 해석 · 불편 분류 (Claude)
    stt: !!process.env.OPENAI_API_KEY, // 서버 음성인식 (OpenAI Whisper)
    db: !!process.env.DATABASE_URL, // 제보 · 방향 보정 저장 (Neon Postgres)
    photo: !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID), // 제보 사진 (Vercel Blob, 비공개)
  })
}
