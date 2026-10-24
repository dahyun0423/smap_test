// public/ 의 사진(pano·thumb·door·building)을 Supabase Storage 공개 버킷에 올린다 (이미 있는 건 덮어씀).
// 사용: node --env-file=.env.local scripts/upload-images-supabase.mjs [버킷=smap]
//   .env.local: SUPABASE_URL + (SUPABASE_SERVICE_KEY 또는 SUPABASE_ANON_KEY). 커밋 금지.
//   anon 키로 올릴 때는 버킷에 anon insert/update 정책이 잠깐 필요 — 다 올린 뒤 지운다 (18번 노트 19장).
// 다 올린 뒤 Vercel 환경변수 VITE_IMG_BASE 를 버킷 공개 주소로 넣는다.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const { SUPABASE_URL } = process.env
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
const BUCKET = process.argv[2] ?? 'smap'
if (!SUPABASE_URL || !KEY) { console.error('SUPABASE_URL 과 키(SUPABASE_SERVICE_KEY 또는 SUPABASE_ANON_KEY)가 필요해요'); process.exit(1) }

const ROOT = new URL('../public/', import.meta.url).pathname
const DIRS = ['pano', 'thumb', 'door', 'building']
const files = (await Promise.all(DIRS.map(async (d) => (await readdir(join(ROOT, d))).filter((f) => f.endsWith('.jpg')).map((f) => `${d}/${f}`)))).flat()

let done = 0, failed = []
async function put(path) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'Cache-Control': 'max-age=604800' },
      body: await readFile(join(ROOT, path)),
    })
    if (r.ok) return
    if (i === 2) throw new Error(`${r.status} ${await r.text()}`)
  }
}
// 6개씩 동시에
for (let i = 0; i < files.length; i += 6) {
  await Promise.all(files.slice(i, i + 6).map((f) => put(f).then(() => done++, (e) => failed.push(`${f}: ${e.message}`))))
  process.stdout.write(`\r${done}/${files.length}`)
}
console.log(`\n올림 ${done}장, 실패 ${failed.length}장`)
if (failed.length) console.log(failed.join('\n'))
