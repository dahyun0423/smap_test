// 브라우저 안에서 실행 — 화면을 피그마로 다시 그릴 수 있는 레이어 데이터로 바꾼다.
// 결과: { w, h, svgs: {id: markup}, root: node }
// node: {k:'b'|'t'|'v'|'i', n:이름, x,y,w,h, ...}  (좌표는 화면 기준 절대값)
export async function serialize() {
  const app = document.querySelector('.app')
  const A = app.getBoundingClientRect()
  const W = A.width, H = A.height
  const svgs = {}
  const svgKey = new Map()
  const addSvg = (markup) => {
    if (!svgKey.has(markup)) { const id = 's' + svgKey.size; svgKey.set(markup, id); svgs[id] = markup }
    return svgKey.get(markup)
  }
  const svgCache = new Map()
  const fetchSvg = async (src) => {
    if (!svgCache.has(src)) svgCache.set(src, await (await fetch(src)).text())
    return svgCache.get(src)
  }
  const R = (v) => Math.round(v * 10) / 10
  const rgba = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    const a = p.length > 3 ? p[3] : 1
    if (a === 0) return null
    return { c: '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''), a: R(a * 100) / 100 }
  }
  const box = (r) => ({ x: R(r.left - A.left), y: R(r.top - A.top), w: R(r.width), h: R(r.height) })
  const outside = (r) => r.right < A.left || r.left > A.right || r.bottom < A.top || r.top > A.bottom
  const nameOf = (el) => (typeof el.className === 'string' && el.className.trim() ? el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase())
  const weight = (w) => Number(w) || 400
  const shadows = (s) => {
    if (!s || s === 'none') return undefined
    const out = []
    for (const part of s.split(/,(?![^(]*\))/)) {
      const col = rgba(part); if (!col) continue
      const nums = part.replace(/rgba?\([^)]+\)/, '').trim().split(/\s+/).filter((x) => x !== 'inset').map(parseFloat)
      out.push([nums[0] || 0, nums[1] || 0, nums[2] || 0, nums[3] || 0, col.c, col.a, /inset/.test(part) ? 1 : 0])
    }
    return out.length ? out : undefined
  }

  function paintOf(el, cs) {
    const p = {}
    const bg = rgba(cs.backgroundColor); if (bg) { p.bg = bg.c; if (bg.a !== 1) p.ba = bg.a }
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) p.gr = cs.backgroundImage
    const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat)
    if (bw.some((v) => v > 0)) {
      const bc = rgba(cs.borderTopColor) || rgba(cs.borderBottomColor) || rgba(cs.borderLeftColor)
      if (bc) { p.bw = bw; p.bc = bc.c; if (bc.a !== 1) p.bca = bc.a; if (cs.borderTopStyle === 'dashed' || cs.borderBottomStyle === 'dashed') p.dash = 1 }
    }
    const r = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(parseFloat)
    if (r.some((v) => v > 0)) p.r = r
    const sh = shadows(cs.boxShadow); if (sh) p.sh = sh
    const bf = cs.backdropFilter || cs.webkitBackdropFilter
    if (bf && bf !== 'none') { const m = bf.match(/blur\(([\d.]+)px\)/); if (m) p.bl = Number(m[1]) }
    const op = Number(cs.opacity); if (op < 1) p.op = R(op * 100) / 100
    return p
  }

  function textNode(run, cs) {
    const s = run.map((t) => t.data).join('').replace(/\s+/g, ' ')
    if (!s.trim()) return null
    const range = document.createRange(); range.setStart(run[0], 0); range.setEnd(run[run.length - 1], run[run.length - 1].data.length)
    const rects = [...range.getClientRects()].filter((r) => r.width > 0)
    if (!rects.length) return null
    const br = range.getBoundingClientRect()
    if (outside(br)) return null
    const tops = new Set(rects.map((r) => Math.round(r.top)))
    const col = rgba(cs.color) || { c: '#000000', a: 1 }
    const fs = parseFloat(cs.fontSize)
    const lh = cs.lineHeight === 'normal' ? fs * 1.2 : parseFloat(cs.lineHeight)
    const t = { k: 't', ...box(br), s: s.replace(/^ | $/g, ''), fs, fw: weight(cs.fontWeight), c: col.c, lh: R(lh), lines: tops.size, rh: R(rects[0].height), tw: R(rects.reduce((v, r) => v + r.width, 0)) }
    if (col.a !== 1) t.a = col.a
    const ls = parseFloat(cs.letterSpacing); if (ls) t.ls = R(ls)
    if (tops.size > 1 && (cs.textAlign === 'center' || cs.textAlign === 'right')) t.al = cs.textAlign
    if (cs.textDecorationLine && cs.textDecorationLine.includes('underline')) t.u = 1
    if (cs.textOverflow === 'ellipsis') t.el = 1
    return t
  }

  async function svgMarkup(el, r) {
    const c = el.cloneNode(true)
    const all = [el, ...el.querySelectorAll('*')]
    const callC = [c, ...c.querySelectorAll('*')]
    all.forEach((src, i) => {
      const s = getComputedStyle(src), d = callC[i]
      if (i === 0) return
      for (const [prop, attr] of [['fill', 'fill'], ['stroke', 'stroke'], ['strokeWidth', 'stroke-width'], ['strokeLinecap', 'stroke-linecap'], ['strokeLinejoin', 'stroke-linejoin'], ['opacity', 'opacity'], ['fillOpacity', 'fill-opacity'], ['strokeOpacity', 'stroke-opacity']]) {
        let v = s[prop]
        if (!v || v === 'none' && attr !== 'fill' && attr !== 'stroke') continue
        if (prop === 'opacity' && v === '1') continue
        const col = /rgb/.test(v) ? rgba(v) : null
        if (col) { v = col.c; if (col.a !== 1) d.setAttribute(attr + '-opacity', col.a) }
        d.setAttribute(attr, v)
      }
      if (s.vectorEffect === 'non-scaling-stroke') d.setAttribute('vector-effect', 'non-scaling-stroke')
    })
    const color = rgba(getComputedStyle(el).color)
    let m = c.outerHTML
    if (color) m = m.replace(/currentColor/g, color.c)
    m = m.replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, '<svg$1').replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, '<svg$1')
    m = m.replace('<svg', `<svg width="${R(r.width)}" height="${R(r.height)}"`)
    if (!/xmlns=/.test(m)) m = m.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    return m
  }

  async function walk(el, parentClip) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return []
    const r = el.getBoundingClientRect()
    const tag = el.tagName.toLowerCase()
    const n = nameOf(el)
    if (el.classList?.contains('pano-canvas')) {
      if (outside(r)) return []
      return [{ k: 'i', n: '360 사진', ...box(r), src: 'PANO' }]
    }
    if (tag === 'svg') {
      if (outside(r) || r.width === 0) return []
      return [{ k: 'v', n: el.getAttribute('class') || 'icon', ...box(r), s: addSvg(await svgMarkup(el, r)) }]
    }
    if (tag === 'img') {
      if (outside(r) || r.width === 0) return []
      const src = el.getAttribute('src') || ''
      const p = paintOf(el, cs)
      if (/\.svg($|\?)/.test(src)) {
        let m = await fetchSvg(el.src)
        m = m.replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, '<svg$1').replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, '<svg$1').replace('<svg', `<svg width="${R(r.width)}" height="${R(r.height)}"`)
        return [{ k: 'v', n: src.split('/').pop(), ...box(r), s: addSvg(m), ...(p.op ? { op: p.op } : {}) }]
      }
      return [{ k: 'i', n: src.split('/').pop(), ...box(r), src, ...(p.r ? { r: p.r } : {}), fit: cs.objectFit }]
    }
    const p = paintOf(el, cs)
    const clip = ['hidden', 'auto', 'scroll', 'clip'].includes(cs.overflowY) || ['hidden', 'auto', 'scroll', 'clip'].includes(cs.overflowX)
    const kids = []
    // ::before / ::after (배경색 있는 장식만)
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo)
      if (!ps.content || ps.content === 'none' || ps.display === 'none') continue
      const bg = rgba(ps.backgroundColor); if (!bg) continue
      const w = parseFloat(ps.width), h = parseFloat(ps.height)
      if (!(w > 0 && h > 0)) continue
      let x = r.left + parseFloat(cs.borderLeftWidth), y = r.top + parseFloat(cs.borderTopWidth)
      if (ps.position === 'absolute') { x += parseFloat(ps.left) || 0; y += parseFloat(ps.top) || 0; x += parseFloat(ps.marginLeft) || 0; y += parseFloat(ps.marginTop) || 0 }
      const rr = parseFloat(ps.borderTopLeftRadius)
      const node = { k: 'b', n: n + pseudo.replace('::', ' '), x: R(x - A.left), y: R(y - A.top), w: R(w), h: R(h), bg: bg.c, ...(bg.a !== 1 ? { ba: bg.a } : {}), ...(rr ? { r: [rr, rr, rr, rr] } : {}) }
      if (pseudo === '::before') kids.unshift(node); else kids.push(node)
    }
    let run = []
    const flush = () => { if (run.length) { const t = textNode(run, cs); if (t) kids.push(t); run = [] } }
    for (const c of el.childNodes) {
      if (c.nodeType === 3) run.push(c)
      else if (c.nodeType === 1) { flush(); kids.push(...(await walk(c, clip ? r : parentClip))) }
    }
    flush()
    if (tag === 'input' || tag === 'textarea') {
      const val = el.value || el.placeholder
      if (val) {
        const isPh = !el.value
        const col = rgba(isPh ? getComputedStyle(el, '::placeholder').color : cs.color) || { c: '#8B95A1', a: 1 }
        const fs = parseFloat(cs.fontSize)
        const lh = cs.lineHeight === 'normal' ? fs * 1.3 : parseFloat(cs.lineHeight)
        const pl = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), pt = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth)
        const w = r.width - pl - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
        const y = tag === 'input' ? r.top + (r.height - lh) / 2 : r.top + pt
        kids.push({ k: 't', n: isPh ? 'placeholder' : 'value', x: R(r.left + pl - A.left), y: R(y - A.top), w: R(w), h: R(lh), s: val, fs, fw: weight(cs.fontWeight), c: col.c, lh: R(lh), lines: tag === 'textarea' ? 2 : 1, rh: R(lh), fixed: 1, ...(col.a !== 1 ? { a: col.a } : {}) })
      }
    }
    const paints = p.bg || p.gr || p.bw || p.sh || p.bl
    const needBox = paints || clip || p.op
    if (!needBox) return kids
    if (outside(r) && !kids.length) return []
    return [{ k: 'b', n, ...box(r), ...p, ...(clip ? { clip: 1 } : {}), c: kids }]
  }

  const root = { k: 'b', n: 'screen', x: 0, y: 0, w: W, h: H, bg: '#f2f4f6', clip: 1, c: await walk(app, null) }
  return { w: W, h: H, svgs, root }
}
