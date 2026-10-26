// 1) 화면 상태마다 레이어 데이터(JSON)+360 사진 영역을 뽑는다. 준비: dev 서버 5199 · npm i --no-save playwright-core · npx playwright install chromium
// 실행: node scripts/figma-screens/capture.mjs [home|search|guide|explore|report] → scripts/figma-screens/out/
// SMAP 화면 상태 캡처 — 390×844 @2x. 결과: out/<flow>/<id>.png + out/manifest.json
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { serialize } from './serialize.mjs'

const BASE = 'http://localhost:5199/'
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out')
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const only = process.argv[2] // 특정 흐름만
fs.mkdirSync(OUT, { recursive: true })
const manifest = fs.existsSync(path.join(OUT, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'))) : {}

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const OFF = { llm: false, stt: false, db: false, photo: false }
const ON = { llm: true, stt: true, db: true, photo: true }
const today = new Date()
const iso = (d) => new Date(today.getTime() - d * 864e5).toISOString()

async function open(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR',
    geolocation: opts.geo, permissions: opts.geo ? ['geolocation'] : [],
  })
  const page = await ctx.newPage()
  const f = opts.features ?? OFF
  await page.route('**/api/health', (r) => r.fulfill({ json: f }))
  await page.route('**/api/closures', (r) => r.fulfill({ json: { rows: opts.closures ?? [] } }))
  await page.route('**/api/yaw', (r) => r.fulfill({ json: {} }))
  await page.route('**/api/feedback**', async (r) => {
    if (r.request().method() === 'GET') return r.fulfill(opts.mine ? { json: { rows: opts.mine } } : { status: 501, json: { error: 'db_disabled' } })
    if (opts.sendDelay) await sleep(opts.sendDelay)
    return f.db ? r.fulfill({ json: { ok: true, id: 101 } }) : r.fulfill({ status: 501, json: { error: 'db_disabled' } })
  })
  await page.route('**/api/photo', (r) => r.fulfill({ json: { path: 'reports/x.jpg' } }))
  if (opts.parse) await page.route('**/api/parse', async (r) => { await sleep(opts.parseDelay ?? 0); r.fulfill({ json: opts.parse }) })
  if (opts.stt) await page.route('**/api/stt', async (r) => { await sleep(opts.sttDelay ?? 0); r.fulfill({ json: { text: opts.stt } }) })
  if (opts.local) await page.addInitScript((v) => { localStorage.setItem('smap.myReports', JSON.stringify(v)) }, opts.local)
  await page.goto(BASE + (opts.q ?? ''), { waitUntil: 'load', timeout: 60000 }); await page.waitForSelector('.app'); await sleep(800)
  return { ctx, page }
}

let flow = '', n = 0
function start(f) { flow = f; n = 0; fs.mkdirSync(path.join(OUT, f), { recursive: true }); manifest[f] = [] }
async function shot(page, title, desc = '', wait = 350) {
  await sleep(wait)
  n += 1
  const id = String(n).padStart(2, '0')
  const file = path.join(flow, `${id}.png`)
  await page.screenshot({ path: path.join(OUT, file) })
  // 피그마용 레이어 데이터 + 360 사진 영역
  const spec = await page.evaluate(serialize)
  if (JSON.stringify(spec.root).includes('"PANO"')) {
    const hide = '.viewer > :not(.pano), .toast, .sheet-backdrop, .pano-loading, .picker, .voice, .report-picker, .tabbar'
    await page.evaluate((h) => document.querySelectorAll(h).forEach((e) => { e.dataset.vis = e.style.visibility; e.style.visibility = 'hidden' }), hide)
    const r = await page.locator('.pano-canvas').first().boundingBox()
    await page.screenshot({ path: path.join(OUT, flow, `${id}-pano.jpg`), type: 'jpeg', quality: 82, clip: r })
    await page.evaluate((h) => document.querySelectorAll(h).forEach((e) => { e.style.visibility = e.dataset.vis || '' }), hide)
  }
  fs.writeFileSync(path.join(OUT, flow, `${id}.json`), JSON.stringify(spec))
  manifest[flow].push({ id, title, desc, file })
  console.log(flow, id, title)
}
const skipSplash = async (page) => { await page.locator('.splash').click({ timeout: 1500 }).catch(() => {}); await page.waitForSelector('.splash', { state: 'detached', timeout: 4000 }).catch(() => {}); await sleep(300) }
const panoReady = async (page) => { await page.waitForSelector('.psv-container canvas', { timeout: 15000 }).catch(() => {}); await sleep(2600) }
const tap = (page, sel) => page.locator(sel).first().click()
const btn = (page, name) => page.getByRole('button', { name, exact: false }).first().click()

const flows = {
  // ───────────── 01 홈 ─────────────
  async home() {
    start('01 홈')
    let { ctx, page } = await open()
    await skipSplash(page)
    await shot(page, '홈 · 처음 (출발·도착 비어 있음)', '길찾기 버튼 비활성, 자주 찾는 곳 칩, 캠퍼스 지도', 200)
    await page.locator('.home').evaluate((e) => e.scrollTo(0, 420))
    await shot(page, '홈 · 아래로 스크롤 (캠퍼스 지도)', '지도 카드 + 편의시설 칩, 하단 메뉴바는 고정')
    await page.locator('.home').evaluate((e) => e.scrollTo(0, 0))
    await tap(page, '.quick .chip:has-text("본관")')
    await shot(page, '자주 찾는 곳 칩 → 출발지 고르기', '도착지가 정해지면 출발지 검색이 열리고 토스트 안내', 250)
    await tap(page, '.picker .result:has-text("버스정류장")')
    await panoReady(page)
    await shot(page, '출발지까지 고르면 바로 길안내 시작', '고른 출발지에서 바로 1단계')
    await ctx.close()

    ;({ ctx, page } = await open({ q: '?from=f-bus' }))
    await skipSplash(page)
    await shot(page, '홈 · 출발지 있음 (공유 링크·NFC)', '출발 = 버스정류장 자동 입력, 도착 비어 있음')
    await ctx.close()

    ;({ ctx, page } = await open({ q: '?from=f-bus&to=b-hyein' }))
    await skipSplash(page)
    await page.goBack().catch(() => {}); await sleep(600)
    await shot(page, '홈 · 출발·도착 모두 → 길찾기 활성', '거리뷰를 닫고 돌아온 상태')
    await page.getByRole('radio', { name: '엘리베이터 우선' }).click()
    await shot(page, '이동 방식 · 엘리베이터 우선 선택', '엘리베이터 위주 경로 (계단은 다른 길이 없을 때만)')
    await btn(page, '출발지·도착지 바꾸기')
    await shot(page, '출발지·도착지 바꾸기', '↑↓ 버튼')
    await ctx.close()

    ;({ ctx, page } = await open({ features: { ...OFF, db: true }, closures: [{ id: 1, node: 'road_bon_2way', type: '엘리베이터 고장', until: '2026-10-12' }, { id: 2, node: 'bukak_b1_elev', type: '공사 중', until: null }] }))
    await skipSplash(page); await sleep(400)
    await shot(page, '홈 · 지금 못 가는 곳 카드', '관리자가 반영한 통행 불가 지점이 있을 때만 보임')
    await ctx.close()

    ;({ ctx, page } = await open())
    await skipSplash(page)
    await page.locator('.home').evaluate((e) => e.scrollTo(0, 420))
    for (const [label, desc] of [['매점', '매점·편의점 핀 (편의점 아이콘)'], ['식당', '식당 핀'], ['카페', '카페 핀'], ['ATM', '유담관 신한은행 · 청운관 로비 ATM'], ['우체국', '우체국 핀'], ['복사', '복사·서점 핀']]) {
      await page.getByRole('radio', { name: label }).click()
      await shot(page, `편의시설 · ${label}`, desc)
    }
    await page.getByRole('radio', { name: '식당' }).click()
    await page.getByRole('tab', { name: '지하' }).first().click()
    await shot(page, '편의시설 · 지하 지도로 전환', '다른 층에 더 있으면 안내 문구')
    await page.getByRole('radio', { name: '건물' }).click()
    await shot(page, '지도 · 지하 (건물)', '지하 제1주차장 연결 안내')
    await page.getByRole('tab', { name: '지상' }).first().click()
    await page.locator('.cmap-pin', { hasText: '본관' }).first().click()
    await shot(page, '건물 핀 → 건물 시트 (본관)', '사진·설명·건물 안 부서 칩 · 거리뷰/여기서 출발/여기로 길찾기', 900)
    await page.locator('.bld-sheet').evaluate((e) => e.scrollTo(0, 9999)).catch(() => {})
    await page.mouse.click(195, 60); await sleep(300)
    await page.locator('.cmap-pin', { hasText: '유담관' }).first().click()
    await shot(page, '건물 시트 (유담관)', '건물마다 부서·시설 칩이 다름', 900)
    await btn(page, '여기로 길찾기')
    await shot(page, '건물 시트 → 여기로 길찾기', '도착 = 유담관, 출발지 검색이 열림', 250)
    await ctx.close()

    ;({ ctx, page } = await open({ q: '?weather=rain' }))
    await skipSplash(page); await sleep(500)
    await shot(page, '비 오는 날 · 실내·지하 길 우선 자동 켜짐', '날씨를 받아 토글이 자동으로 켜지고 안내 문구가 바뀜')
    await ctx.close()

    ;({ ctx, page } = await open())
    await skipSplash(page); await sleep(500)
    await shot(page, '맑은 날 · 실내·지하 길 우선 꺼짐', '사용자가 직접 켤 수 있음')
    await ctx.close()
  },

  // ───────────── 일부 화면만 다시 (피그마 덮어쓰기용) ─────────────
  async patch() {
    start('patch')
    let { ctx, page } = await open()
    await skipSplash(page)
    await page.locator('.home').evaluate((e) => e.scrollTo(0, 420))
    await page.getByRole('radio', { name: '매점' }).click()
    await shot(page, '편의시설 · 매점', '매점·편의점 핀 · 북악관 GS25는 지하 지도에')
    await ctx.close()

    ;({ ctx, page } = await open({ q: '?from=f-gate&to=bukak_b1_cafeteria' }))
    await skipSplash(page)
    await panoReady(page)
    await btn(page, '다음')
    await panoReady(page)
    await btn(page, '전체 단계 보기')
    await shot(page, '전체 경로 · 지도 + 예상 소요 시간', '카카오맵식 경로 지도, 단계를 누르면 그 지점으로', 800)
    await ctx.close()
  },

  // ───────────── 02 검색 · 출발지 · 음성 ─────────────
  async search() {
    start('02 검색 · 출발지 · 음성')
    let { ctx, page } = await open()
    await skipSplash(page)
    await btn(page, '건물, 부서, 교수님 연구실 검색')
    await shot(page, '도착지 검색 · 처음 (자주 찾는 곳)', '검색창에 바로 커서')
    for (const [q, t] of [['유', '한 글자 입력'], ['예산', '부서 검색'], ['교무', '부서 · 예시 데이터 표시'], ['303', '호실 번호'], ['교수', '교수님 연구실'], ['도서관', '건물 별명'], ['ㅁㄴㅇ', '결과 없음']]) {
      await page.locator('.picker input').fill(q)
      await shot(page, `도착지 검색 · "${q}"`, t, 250)
    }
    await page.locator('.picker input').fill('예산')
    await page.locator('.result').first().click()
    await shot(page, '결과 선택 → 출발지 고르기', '토스트: ○○까지 안내할게요. 지금 계신 곳을 골라주세요', 250)
    await shot(page, '출발지 고르기 · 처음', '현재 위치로 / 지도에서 고르기 / 자주 찾는 곳', 3300)
    await tap(page, '.here-list .result:has-text("지도에서 고르기")')
    await shot(page, '출발지 · 지도에서 고르기 펼침', '지도를 누르면 가장 가까운 촬영 지점')
    await page.locator('.picker input').fill('북악')
    await shot(page, '출발지 검색 · "북악" (360 지점 포함)', '건물 + 360 촬영 지점')
    await ctx.close()

    ;({ ctx, page } = await open({ geo: { latitude: 37.5665, longitude: 126.978 } }))
    await skipSplash(page)
    await tap(page, '.route-field >> nth=0')
    await tap(page, '.here-list .result:has-text("현재 위치로")')
    await shot(page, '현재 위치 · 학교 밖', '오류 안내', 1200)
    await ctx.close()

    ;({ ctx, page } = await open({ geo: { latitude: 37.6152, longitude: 127.0128 } }))
    await skipSplash(page)
    await tap(page, '.route-field >> nth=0')
    await tap(page, '.here-list .result:has-text("현재 위치로")')
    await shot(page, '현재 위치 · 캠퍼스 안 → 출발지 자동', '가장 가까운 촬영 지점으로 출발지 입력', 1200)
    await ctx.close()

    // 음성 — 브라우저 음성인식이 없는 기기 (예시 문장만)
    ;({ ctx, page } = await open())
    await skipSplash(page)
    await tap(page, '.tab-voice')
    await shot(page, '말로 길 묻기 · 열림', '이렇게 말해 보세요 예시')
    await btn(page, '유담관이 어디에요?')
    await shot(page, '예시 → 바로 안내 (도착 = 유담관)', '출발지가 없으면 출발지 고르기', 400)
    await ctx.close()

    // 음성 — 서버 음성인식 (듣는 중 → 알아듣는 중 → 후보)
    ;({ ctx, page } = await open({ features: { ...OFF, stt: true }, stt: '학생 어디야', sttDelay: 2500 }))
    await skipSplash(page)
    await tap(page, '.tab-voice')
    await shot(page, '음성 · 듣는 중', '다 말하면 버튼을 누르세요 (8초 뒤 자동 멈춤)', 900)
    await page.waitForSelector('.mic-big.is-on', { timeout: 10000 }).catch(() => {}); await tap(page, '.mic-big')
    await shot(page, '음성 · 알아듣는 중…', '녹음 → 서버 음성인식', 400)
    await shot(page, '음성 · 후보 제시 ("학생 어디야")', '하나로 못 정하면 후보 칩', 2800)
    await ctx.close()

    // 음성 — 용무 질문 (AI)
    ;({ ctx, page } = await open({ features: { ...OFF, llm: true }, parse: { to: 'r-hyein-101', from: null, avoidStairs: false, reply: '증명서 발급은 교무처(혜인관 1층 101호)에서 해요. 교무처까지 안내할게요.' }, parseDelay: 1500 }))
    await skipSplash(page)
    await tap(page, '.tab-voice')
    await btn(page, '졸업증명서 떼려면')
    await shot(page, '용무 질문 · 찾는 중…', '"졸업증명서 떼려면 어디로 가요?" → AI가 용무 사전에서 찾음', 300)
    await shot(page, '용무 질문 → 답 + 출발지 고르기', '답을 화면 토스트·음성으로 + 교무처까지', 1700)
    await ctx.close()

    ;({ ctx, page } = await open({ q: '?from=f-bus' }))
    await skipSplash(page)
    await tap(page, '.tab-voice')
    await btn(page, '전공책 어디서 사요?')
    await panoReady(page)
    await shot(page, '용무 질문 (출발지 있음) → 바로 길안내', '"전공책 어디서 사요?" → 서점')
    await ctx.close()
  },

  // ───────────── 03 거리뷰 길안내 ─────────────
  async guide() {
    start('03 거리뷰 길안내')
    let { ctx, page } = await open({ q: '?from=f-gate&to=bukak_b1_cafeteria' })
    await skipSplash(page)
    await panoReady(page)
    await shot(page, '1단계 · 출발 (미니맵 켜짐)', '파랗게 빛나는 화살표 = 다음 길')
    await tap(page, '.viewer-top [aria-label="미니맵"]')
    await shot(page, '미니맵 끄기', '사진을 크게')
    await tap(page, '.viewer-top [aria-label="미니맵"]')
    await btn(page, '음성 안내 끄기')
    await shot(page, '음성 안내 끄기', '스피커 아이콘 바뀜')
    await btn(page, '음성 안내 켜기')
    const total = await page.locator('.step-count').innerText()
    const last = Number(total.split('/')[1].replace(/\D/g, ''))
    for (let i = 2; i <= last; i++) {
      await btn(page, '다음')
      await panoReady(page)
      const note = await page.locator('.step-note').count()
      const where = await page.locator('.where-title').innerText()
      await shot(page, `${i}단계 · ${where}`, note ? '이동 안내 문구 있음' : '', 0)
    }
    await btn(page, '전체 단계 보기')
    await shot(page, '전체 경로 · 지도 + 예상 소요 시간', '카카오맵식 경로 지도, 단계를 누르면 그 지점으로', 800)
    await tap(page, '.route-close'); await sleep(300)
    await btn(page, '다음')
    await panoReady(page)
    await shot(page, '도착', '안내가 정확했나요?')
    await btn(page, '정확했어요')
    await shot(page, '도착 · 👍 정확했어요 누름', '고마워요! (검증됨 기록)')
    await btn(page, '이전')
    await panoReady(page)
    await shot(page, '이전 단계로', '이전 버튼')
    await ctx.close()

    ;({ ctx, page } = await open({ q: '?from=f-bus&to=b-hyein' }))
    await skipSplash(page)
    await page.goBack(); await sleep(500)
    await page.getByRole('radio', { name: '엘리베이터 우선' }).click()
    await btn(page, '길찾기')
    await panoReady(page)
    await shot(page, '엘리베이터 우선으로 길안내', '엘리베이터 위주 경로 (계단은 다른 길이 없을 때만)')
    await ctx.close()

    ;({ ctx, page } = await open({ features: { ...OFF, db: true }, closures: [{ id: 1, node: 'road_bon_2way', type: '공사 중', until: null }], q: '?from=f-gate&to=b-bonkwan' }))
    await skipSplash(page)
    await panoReady(page)
    await shot(page, '못 가는 곳을 피한 길안내', '본관 오르막 2갈래 통행 불가 → 돌아가는 길')
    await ctx.close()
  },

  // ───────────── 04 거리뷰 둘러보기 ─────────────
  async explore() {
    start('04 거리뷰 둘러보기 (지도 탭)')
    let { ctx, page } = await open()
    await skipSplash(page)
    await tap(page, '.tab-item-l')
    await page.waitForSelector('.toast')
    await shot(page, '지도 탭 (출발지 없음) → 정문에서 · 사진 불러오는 중', '토스트: 정문에서 둘러봐요. 출발지를 정하면 그 자리에서 열려요', 300)
    await panoReady(page)
    await shot(page, '둘러보기 · 정문', '아래 카드: 여기서 출발 / 제보', 1500)
    await page.locator('.pv-link').first().click().catch(() => {})
    await panoReady(page)
    await shot(page, '사진 속 화살표 → 다음 지점으로 이동', '자유롭게 이동')
    await tap(page, '.viewer-top [aria-label="미니맵"]')
    await shot(page, '둘러보기 · 미니맵 끄기', '')
    await tap(page, '.viewer-top [aria-label="미니맵"]')
    await btn(page, '여기서 출발')
    await shot(page, '여기서 출발 → 도착지 검색', '지금 보던 지점이 출발지', 300)
    await ctx.close()

    ;({ ctx, page } = await open({ q: '?src=nfc&from=f-bus' }))
    await sleep(3000)
    await tap(page, '.tab-item-l')
    await page.waitForSelector('.toast')
    await sleep(1800)
    await shot(page, '지도 탭 (NFC 출발지 = 버스정류장) → 그 자리에서', '토스트: 지금 위치(버스정류장)에서 둘러봐요', 0)
    await ctx.close()

    ;({ ctx, page } = await open({ q: '?node=bukak_b1_cafeteria' }))
    await skipSplash(page)
    await panoReady(page)
    await shot(page, '실내 지하 지점 둘러보기', '미니맵이 지하 지도로')
    await ctx.close()

    ;({ ctx, page } = await open({ q: '?node=hill_entrance' }))
    await skipSplash(page)
    await sleep(2500)
    await shot(page, '일반 사진 지점 (360 재촬영 필요)', '사진 아래 버튼으로 이동')
    await ctx.close()
  },

  // ───────────── 05 제보 ─────────────
  async report() {
    start('05 제보')
    let { ctx, page } = await open({ features: ON, sendDelay: 1200 })
    await skipSplash(page)
    await tap(page, '.tab-item-r')
    await shot(page, '제보 탭 → 종류 고르기', '4종류 + 내 제보 현황 링크')
    await btn(page, '정보가 틀려요')
    await shot(page, '정보가 틀려요 · 처음', '위치 없음 가능 (내용에 적기)')
    await btn(page, '이동 방향(화살표)이 틀려요')
    await page.locator('.report-sheet textarea').fill('유담관 3갈래에서 화살표가 반대쪽을 가리켜요')
    await shot(page, '정보가 틀려요 · 유형 + 내용', '보내기 활성')
    await tap(page, '.report-sheet .btn-primary')
    await shot(page, '보내는 중…', '', 200)
    await shot(page, '보내기 완료 토스트', 'AI가 분류하고 팀이 확인', 1300)
    await tap(page, '.tab-item-r')
    await btn(page, '지금 못 가요')
    await shot(page, '지금 못 가요 · 처음', '위치·무슨 일·기간 필수')
    await tap(page, '.report-loc-row .chip:has-text("검색")')
    await shot(page, '위치 · 검색으로 고르기', '제보 시트 위에 검색 화면')
    await page.locator('.report-picker input').fill('북악관 지하')
    await page.locator('.report-picker .result').first().click()
    await tap(page, '.report-loc-row .chip:has-text("지도에서")')
    await shot(page, '위치 · 지도에서 고르기', '지도를 누르면 가장 가까운 촬영 지점')
    await btn(page, '엘리베이터 고장')
    await page.getByRole('radio', { name: '이번 주' }).click()
    await page.locator('.report-sheet').evaluate((e) => e.scrollTo(0, 9999))
    await shot(page, '지금 못 가요 · 무슨 일 + 기간 선택', '이번 주 = 6일 뒤까지')
    await page.locator('.report-sheet input[type=file]').setInputFiles(path.join(process.cwd(), 'public/thumb/bon_1f_front.jpg'))
    await page.locator('.report-sheet').evaluate((e) => e.scrollTo(0, 9999))
    await shot(page, '현장 사진 첨부', '사진 빼기 가능', 500)
    await page.mouse.click(195, 30); await sleep(300)
    await tap(page, '.tab-item-r')
    await btn(page, '더 좋은 길 알려줄게요')
    await shot(page, '더 좋은 길 · 처음', '출발·도착 + 태그 + 설명')
    await page.locator('.report-loc').first().click()
    await page.locator('.report-picker input').fill('버스')
    await page.locator('.report-picker .result').first().click()
    await page.locator('.report-loc').nth(1).click()
    await page.locator('.report-picker input').fill('스콘')
    await page.locator('.report-picker .result').first().click()
    await btn(page, '짐 많을 때'); await btn(page, '엘리베이터 위주')
    await page.locator('.report-sheet textarea').fill('버정에서 혜인관 엘리베이터 타고 올라가서 스콘스퀘어로 나가면 언덕 안 올라가도 돼요')
    await page.locator('.report-sheet').evaluate((e) => e.scrollTo(0, 9999))
    await shot(page, '더 좋은 길 · 다 채움', '태그 여러 개')
    await page.mouse.click(195, 30); await sleep(300)
    await tap(page, '.tab-item-r')
    await btn(page, '안내가 정확해요')
    await shot(page, '안내가 정확해요', '잘 맞았던 곳')
    await ctx.close()

    ;({ ctx, page } = await open({ features: ON, mine: [
      { id: 3, created_at: iso(1), kind: 'course', node: 'bus_stop', type: '짐 많을 때, 엘리베이터 위주', memo: null, status: 'applied', until: null, from_node: 'bus_stop', to_node: 'gate_front', tags: ['짐 많을 때'], updated_at: iso(0) },
      { id: 2, created_at: iso(2), kind: 'closure', node: 'road_bon_2way', type: '엘리베이터 고장', memo: null, status: 'checking', until: null, from_node: null, to_node: null, tags: null, updated_at: iso(1) },
      { id: 1, created_at: iso(3), kind: 'issue', node: 'road_yudam_3way', type: '이동 방향(화살표)이 틀려요', memo: null, status: 'received', until: null, from_node: null, to_node: null, tags: null, updated_at: null },
      { id: 0, created_at: iso(5), kind: 'issue', node: 'home', type: '기타', memo: '지도 글씨가 작아요', status: 'rejected', until: null, from_node: null, to_node: null, tags: null, updated_at: iso(4) },
    ] }))
    await page.waitForSelector('.toast:has-text("반영")', { timeout: 10000 })
    await shot(page, '앱 열 때 · 제보 반영 알림', '"제보하신 ○○이 반영됐어요. 고마워요!"', 0)
    await tap(page, '.tab-item-r')
    await btn(page, '내 제보 현황 보기')
    await shot(page, '내 제보 현황', '받음 → 확인 중 → 반영됨 / 반영 안 됨', 600)
    await ctx.close()

    ;({ ctx, page } = await open({ local: [{ id: -1, created_at: iso(0), kind: 'closure', node: 'bukak_b1_elev', type: '엘리베이터 고장', memo: null, status: 'received', until: null, from_node: null, to_node: null, tags: null, updated_at: null, local: true }] }))
    await skipSplash(page)
    await tap(page, '.tab-item-r')
    await btn(page, '내 제보 현황 보기')
    await shot(page, '내 제보 현황 · 서버 연결 전', '이 기기에만 저장됨', 600)
    await ctx.close()

    ;({ ctx, page } = await open())
    await skipSplash(page)
    await tap(page, '.tab-item-r')
    await btn(page, '내 제보 현황 보기')
    await shot(page, '내 제보 현황 · 비어 있음', '', 600)
    await ctx.close()

    ;({ ctx, page } = await open({ q: '?from=f-gate&to=bukak_b1_cafeteria' }))
    await skipSplash(page)
    await panoReady(page)
    await btn(page, '제보하기 (헷갈려요')
    await shot(page, '길안내 중 깃발 → 제보', '위치 = 지금 지점 자동')
    await ctx.close()
  },
}

for (const [k, fn] of Object.entries(flows)) {
  if (only && only !== k) continue
  try { await fn() } catch (e) { console.error('FAIL', k, e.message.split('\n').slice(0,3).join(' | '), (e.stack.match(/capture.mjs:(\d+)/g)||[]).join(',')) }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
}
await browser.close()
