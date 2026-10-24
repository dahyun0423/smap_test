// 제보 사진 — Vercel Blob 비공개(private) 저장. 얼굴·개인정보가 찍힐 수 있어 관리자만 볼 수 있다.
// POST: 이미지(앱에서 1280px JPEG로 줄여서 보냄) → { path }
// GET ?path=… (헤더 x-admin-key) → 이미지
import { get, put } from '@vercel/blob'

const enabled = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
const MAX = 3 * 1024 * 1024

export async function POST(request: Request) {
  if (!enabled()) return Response.json({ error: 'photo_disabled' }, { status: 501 })
  const type = request.headers.get('content-type') ?? ''
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return Response.json({ error: 'bad_type' }, { status: 400 })
  const body = await request.arrayBuffer()
  if (!body.byteLength || body.byteLength > MAX) return Response.json({ error: 'too_large' }, { status: 413 })
  const ext = type.split('/')[1].replace('jpeg', 'jpg')
  const blob = await put(`reports/photo.${ext}`, body, { access: 'private', contentType: type, addRandomSuffix: true })
  return Response.json({ path: blob.pathname })
}

export async function GET(request: Request) {
  if (!enabled()) return Response.json({ error: 'photo_disabled' }, { status: 501 })
  if (!process.env.ADMIN_KEY || request.headers.get('x-admin-key') !== process.env.ADMIN_KEY) return Response.json({ error: 'forbidden' }, { status: 403 })
  const path = new URL(request.url).searchParams.get('path')
  if (!path?.startsWith('reports/')) return Response.json({ error: 'bad_request' }, { status: 400 })
  const r = await get(path, { access: 'private' })
  if (!r || r.statusCode !== 200) return Response.json({ error: 'not_found' }, { status: 404 })
  return new Response(r.stream, { headers: { 'content-type': r.blob.contentType, 'cache-control': 'private, no-store' } })
}
