// 2) 흐름 하나를 피그마로 보낼 운반용 SVG로 묶는다 (JSON은 <text>, 사진은 <image>) → upload_assets로 올리면 피그마에 그대로 들어감
// 흐름 하나 → 피그마로 보낼 운반용 SVG (레이어 데이터 JSON + 사진들)
import fs from 'node:fs'; import path from 'node:path'
const flow = process.argv[2], OUT = 'scripts/figma-screens/out', PUB = path.join(process.cwd(), 'public')
const man = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json')))[flow]
const svgs = {}, keyOf = new Map(), imgs = new Map()
const screens = man.map((m) => {
  const spec = JSON.parse(fs.readFileSync(path.join(OUT, flow, `${m.id}.json`)))
  const remap = {}
  for (const [k, v] of Object.entries(spec.svgs)) { if (!keyOf.has(v)) { const id = 'g' + keyOf.size; keyOf.set(v, id); svgs[id] = v } remap[k] = keyOf.get(v) }
  const fix = (n) => { if (n.k === 'v') n.s = remap[n.s]; if (n.k === 'i') { if (n.src === 'PANO') { n.src = `PANO/${m.id}`; imgs.set(n.src, path.join(OUT, flow, `${m.id}-pano.jpg`)) } else { const f = n.src.startsWith('blob:') ? path.join(PUB, 'thumb/bon_1f_front.jpg') : path.join(PUB, n.src.replace(/^\//, '')); imgs.set(n.src, f) } } (n.k === "b" ? n.c || [] : []).forEach(fix) }
  fix(spec.root)
  return { id: m.id, title: m.title, root: spec.root }
})
const json = JSON.stringify({ svgs, screens }).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const CH = 20000, parts = []
for (let i = 0; i < json.length; i += CH) parts.push(json.slice(i, i + CH))
let body = parts.map((p, i) => `<text id="DATA-${String(i).padStart(3, '0')}" x="0" y="${10 + i * 12}" font-family="Gothic A1" font-size="4" xml:space="preserve">${esc(p)}</text>`).join('\n')
let i = 0
for (const [key, file] of imgs) {
  if (!fs.existsSync(file)) { console.error('missing', file); continue }
  const ext = file.endsWith('.png') ? 'png' : 'jpeg'
  body += `\n<image id="IMG-${i}" data-key="${esc(key)}" x="${i * 4}" y="0" width="4" height="4" href="data:image/${ext};base64,${fs.readFileSync(file).toString('base64')}"/>`
  i++
}
const keys = [...imgs.keys()]
body += `\n<text id="KEYS" x="0" y="2" font-family="Gothic A1" font-size="4" xml:space="preserve">${esc(JSON.stringify(keys).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')))}</text>`
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">\n${body}\n</svg>`
const outFile = path.join(OUT, `carrier-${flow.slice(0, 2)}.svg`)
fs.writeFileSync(outFile, svg)
console.log(outFile, (svg.length / 1024 / 1024).toFixed(2) + 'MB', 'chunks', parts.length, 'imgs', keys.length, 'svgs', keyOf.size)
