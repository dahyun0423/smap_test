// 학교 캠퍼스맵 호실 데이터 → 앱 검색용 src/data/rooms.json
// 사용: node scripts/build-rooms.ts
// 원본(scripts/data/school-rooms.json): skuniv.ac.kr/wp-json/cache/api/v1/contacts/1gUwLn9GYuDxm8nR9apRPaUiQipShakwhAe2X6h72BMM/호실
import { readFileSync, writeFileSync } from 'node:fs'

interface Raw { 건물명: string; 호수: string; 호실명: string; 호실용도: string }

const BUILDING: Record<string, string> = {
  유담관: 'yudam', 북악관: 'bukak', 문예관: 'moonye', 대일관: 'daeil', 상승관: 'sangseung', 청운관: 'chungwoon',
  혜인관: 'hyein', 은주1관: 'eunju1', 은주2관: 'eunju2', 한림관: 'hanlim', 본관: 'bonkwan', 수인관: 'suin',
}
// 길찾기 대상이 아닌 공간
const SKIP_USE = new Set(['화장실', '복도', '기계실', '공용'])

/** 호수 → 층 (지하는 음수, 모르면 null). 4자리는 앞 두 자리가 층 — 본관 6122만 예외 */
function floorOf(building: string, h: string): number | null {
  h = h.trim()
  if (!h) return null
  if (h.startsWith('유)')) return 16 // 유담관 16층 창업보육센터
  let m = h.match(/^(\d+)(F|층)/)
  if (m) return Number(m[1])
  m = h.match(/^B(\d)/)
  if (m) return -Number(m[1])
  m = h.match(/^(\d+)/)
  if (!m) return null
  const d = m[1]
  if (d.length === 3) return Number(d[0])
  if (d.length === 4) return building === '본관' ? Number(d[0]) : Number(d.slice(0, 2))
  return null
}

const raw: Raw[] = JSON.parse(readFileSync('scripts/data/school-rooms.json', 'utf8'))
const out = raw
  .filter((r) => BUILDING[r.건물명] && !SKIP_USE.has(r.호실용도) && r.호실명.trim() && r.호실명.trim() !== '공실')
  .map((r) => ({ b: BUILDING[r.건물명], f: floorOf(r.건물명, r.호수), h: r.호수.trim(), n: r.호실명.trim(), u: r.호실용도 }))
writeFileSync('src/data/rooms.json', JSON.stringify(out))
console.log(`호실 ${raw.length}개 중 ${out.length}개 → src/data/rooms.json`)
