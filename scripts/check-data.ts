// 데이터 점검: node scripts/check-data.ts
import { readFileSync, readdirSync } from 'node:fs'
import { NODES, EDGES, PLACES, NODE_BY_ID } from '../src/data/campus.ts'

const panos = new Set(readdirSync('public/pano').map((f) => f.replace('.jpg', '')))
const mapIds = new Set([...Object.values(JSON.parse(readFileSync('scripts/pano-map.json', 'utf8'))), ...JSON.parse(readFileSync('src/data/floor-panos.json', 'utf8')).map((r: { id: string }) => r.id)] as string[])
let bad = 0
const err = (m: string) => { bad++; console.log('✗', m) }
const ids = new Set<string>()
for (const n of NODES) { if (ids.has(n.id)) err(`중복 지점 ${n.id}`); ids.add(n.id); if (!panos.has(n.id)) err(`사진 없음 ${n.id}`) }
for (const id of mapIds) if (!ids.has(id)) err(`지점 정의 없음 ${id}`)
for (const e of EDGES) for (const k of [e.a, e.b]) if (!NODE_BY_ID.has(k)) err(`연결에 없는 지점 ${k}`)
for (const p of PLACES) if (!NODE_BY_ID.has(p.node)) err(`장소 ${p.name} → 없는 지점 ${p.node}`)
// 연결성: 정문에서 닿지 않는 지점
const adj = new Map<string, string[]>()
for (const e of EDGES) { (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b); (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a) }
const seen = new Set(['gate_front']); const q = ['gate_front']
while (q.length) for (const x of adj.get(q.shift()!) ?? []) if (!seen.has(x)) { seen.add(x); q.push(x) }
for (const n of NODES) if (!seen.has(n.id)) err(`정문에서 닿지 않음 ${n.id}`)
console.log(`지점 ${NODES.length} · 연결 ${EDGES.length} · 장소 ${PLACES.length} · 문제 ${bad}`)
