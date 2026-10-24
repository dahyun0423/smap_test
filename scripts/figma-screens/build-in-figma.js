// 3) 피그마 플러그인 코드(use_figma) — 올린 운반용 SVG(CARRIER)의 데이터로 화면 프레임을 그린다.
// SEC = 「🧩 화면 상태 전부 · …」 섹션 id. 카드마다 마지막 자식(자리 표시 또는 이전 화면)을 새 프레임으로 바꾼다.
// 글꼴: Pretendard 대신 Gothic A1 (피그마 플러그인 환경에 Pretendard가 없음) — 앱의 글자 폭에 맞춰 자간을 보정한다.
const CARRIER = '000:0000', SEC = '140:3521', FROM = 0, TO = 10, DONE = false
const car = await figma.getNodeByIdAsync(CARRIER)
const data = JSON.parse(car.findAll((n) => n.type === 'TEXT' && n.name.startsWith('DATA-')).sort((a, b) => a.name.localeCompare(b.name)).map((t) => t.characters).join(''))
const keys = JSON.parse(car.findOne((n) => n.name === 'KEYS').characters)
const hashes = {}
for (const r of car.findAll((n) => n.type === 'RECTANGLE' && n.name.startsWith('IMG-'))) { const f = r.fills.find((f) => f.type === 'IMAGE'); if (f) hashes[keys[Number(r.name.slice(4))]] = f.imageHash }
const sec = await figma.getNodeByIdAsync(SEC)
const cards = sec.children[0].children.find((c) => c.name === '화면').children
const STY = (w) => (w <= 450 ? 'Regular' : w <= 550 ? 'Medium' : w <= 650 ? 'SemiBold' : w <= 750 ? 'Bold' : 'ExtraBold')
for (const s of ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) await figma.loadFontAsync({ family: 'Gothic A1', style: s })
const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 })
const solid = (h, a) => ({ type: 'SOLID', color: hex(h), opacity: a ?? 1 })
function grad(css) {
  const stops = [...css.matchAll(/rgba?\(([^)]+)\)\s*([\d.]+)%?/g)].map((m, i, arr) => { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { position: m[2] !== undefined && m[0].includes('%') ? Number(m[2]) / 100 : i / (arr.length - 1 || 1), color: { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 } } })
  if (stops.length < 2) return null
  const radial = css.startsWith('radial')
  return { type: radial ? 'GRADIENT_RADIAL' : 'GRADIENT_LINEAR', gradientStops: stops, gradientTransform: radial ? [[1, 0, 0], [0, 1, 0.5]] : [[0, 1, 0], [-1, 0, 1]] }
}
function effects(n) { const fx = []; for (const [x, y, b, s, c, a, ins] of n.sh || []) fx.push({ type: ins ? 'INNER_SHADOW' : 'DROP_SHADOW', color: { ...hex(c), a }, offset: { x, y }, radius: b, spread: s, visible: true, blendMode: 'NORMAL' }); if (n.bl) fx.push({ type: 'BACKGROUND_BLUR', radius: n.bl, visible: true }); return fx }
function radius(node, r) { if (!r) return; const [a, b, c, d] = r; if (a === b && b === c && c === d) node.cornerRadius = a; else { node.topLeftRadius = a; node.topRightRadius = b; node.bottomRightRadius = c; node.bottomLeftRadius = d } }
function build(n, parent, px, py) {
  let node
  if (n.k === 'b') {
    node = figma.createFrame(); node.name = n.n; node.resize(Math.max(n.w, 0.01), Math.max(n.h, 0.01))
    const fills = []; if (n.bg) fills.push(solid(n.bg, n.ba)); if (n.gr) { const g = grad(n.gr); if (g) fills.push(g) } node.fills = fills
    radius(node, n.r)
    if (n.bw) { node.strokes = [solid(n.bc, n.bca)]; node.strokeAlign = 'INSIDE'; const [t, r, b, l] = n.bw; if (t === r && r === b && b === l) node.strokeWeight = t; else { node.strokeTopWeight = t; node.strokeRightWeight = r; node.strokeBottomWeight = b; node.strokeLeftWeight = l } if (n.dash) node.dashPattern = [5, 4] }
    const fx = effects(n); if (fx.length) node.effects = fx
    if (n.op !== undefined) node.opacity = n.op
    node.clipsContent = !!n.clip
    parent.appendChild(node); node.x = n.x - px; node.y = n.y - py
    for (const c of n.c || []) build(c, node, n.x, n.y)
  } else if (n.k === 't') {
    node = figma.createText(); node.fontName = { family: 'Gothic A1', style: STY(n.fw) }; node.fontSize = n.fs; node.lineHeight = { unit: 'PIXELS', value: n.lh }
    node.characters = n.s; node.fills = [solid(n.c, n.a)]; node.name = n.s.slice(0, 30)
    if (n.u) node.textDecoration = 'UNDERLINE'
    parent.appendChild(node)
    node.textAutoResize = 'WIDTH_AND_HEIGHT'; node.letterSpacing = { unit: 'PIXELS', value: n.ls || 0 }
    const len = [...n.s].length, nat = node.width, target = n.fixed ? 0 : n.tw || n.w
    if (target && len > 1 && target > nat * 0.7) node.letterSpacing = { unit: 'PIXELS', value: (n.ls || 0) + Math.max(-2.5, Math.min(1, (target - nat) / len)) }
    const dy = (n.lh - n.rh) / 2
    if (n.lines > 1 || n.fixed) { node.textAutoResize = 'HEIGHT'; node.resize(n.w + (n.fixed ? 0 : 3), n.h); if (n.al) node.textAlignHorizontal = n.al === 'center' ? 'CENTER' : 'RIGHT'; node.x = n.x - px - (n.fixed ? 0 : 1); node.y = n.y - py - (n.fixed ? 0 : dy) }
    else { node.x = n.x - px; node.y = n.y - py - dy }
  } else if (n.k === 'v') {
    try { node = figma.createNodeFromSvg(data.svgs[n.s]) } catch { node = figma.createFrame(); node.fills = [] }
    node.name = n.n; parent.appendChild(node)
    if (Math.abs(node.width - n.w) > 0.5 || Math.abs(node.height - n.h) > 0.5) node.resize(Math.max(n.w, 0.01), Math.max(n.h, 0.01))
    node.x = n.x - px; node.y = n.y - py
    if (n.op !== undefined) node.opacity = n.op
  } else if (n.k === 'i') {
    node = figma.createRectangle(); node.name = n.n; node.resize(Math.max(n.w, 0.01), Math.max(n.h, 0.01))
    const h = hashes[n.src]; node.fills = h ? [{ type: 'IMAGE', imageHash: h, scaleMode: 'FILL' }] : [solid('#dddddd')]
    radius(node, n.r); parent.appendChild(node); node.x = n.x - px; node.y = n.y - py
  }
  return node
}
for (let i = FROM; i < Math.min(TO, data.screens.length); i++) {
  const sc = data.screens[i], card = cards[i], ph = card.children[card.children.length - 1]
  const fr = figma.createFrame(); fr.name = `${sc.id} ${sc.title}`; fr.resize(390, 844); fr.clipsContent = true; fr.fills = [solid(sc.root.bg || '#F2F4F6')]
  card.insertChild(card.children.length - 1, fr)
  for (const c of sc.root.c) build(c, fr, 0, 0)
  ph.remove()
}
if (DONE) car.remove()
