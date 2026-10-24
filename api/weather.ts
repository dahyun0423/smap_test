// 지금 캠퍼스(성북구 정릉동) 날씨 — 비·눈이 오면 앱이 실내·지하 길을 먼저 안내한다.
// 기상청 초단기실황(공공데이터포털 키가 있으면) → 없으면 Open-Meteo(키 불필요). 10분 캐시.

// 서경대 위경도 → 기상청 격자 (Lambert 변환)
const LAT = 37.6153, LON = 127.0137
const NX = 60, NY = 128

export interface Weather {
  wet: boolean // 비·눈이 오는 중
  kind: 'rain' | 'snow' | 'sleet' | null
  temp: number | null
  source: 'kma' | 'open-meteo'
}

// 기상청 PTY: 0 없음 1 비 2 비/눈 3 눈 5 빗방울 6 빗방울눈날림 7 눈날림
const PTY: Record<string, Weather['kind']> = { '1': 'rain', '2': 'sleet', '3': 'snow', '5': 'rain', '6': 'sleet', '7': 'snow' }

async function fromKma(key: string): Promise<Weather | null> {
  // 매시 정각 자료가 40분쯤 올라오므로 40분 전 시각의 정각을 기준으로 묻는다 (한국 시간)
  const t = new Date(Date.now() + 9 * 3600_000 - 40 * 60_000)
  const date = t.toISOString().slice(0, 10).replaceAll('-', '')
  const hour = `${String(t.getUTCHours()).padStart(2, '0')}00`
  const q = new URLSearchParams({ serviceKey: key, dataType: 'JSON', numOfRows: '10', pageNo: '1', base_date: date, base_time: hour, nx: String(NX), ny: String(NY) })
  const r = await fetch(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?${q}`, { signal: AbortSignal.timeout(5000) })
  if (!r.ok) return null
  const items = ((await r.json()) as { response?: { body?: { items?: { item?: { category: string; obsrValue: string }[] } } } })
    .response?.body?.items?.item
  if (!items?.length) return null
  const v = (c: string) => items.find((i) => i.category === c)?.obsrValue
  const kind = PTY[v('PTY') ?? '0'] ?? null
  const temp = v('T1H')
  return { wet: kind !== null, kind, temp: temp ? Number(temp) : null, source: 'kma' }
}

async function fromOpenMeteo(): Promise<Weather | null> {
  const q = new URLSearchParams({ latitude: String(LAT), longitude: String(LON), current: 'temperature_2m,precipitation,rain,snowfall,weather_code', timezone: 'Asia/Seoul' })
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(5000) })
  if (!r.ok) return null
  const c = ((await r.json()) as { current?: { temperature_2m: number; rain: number; snowfall: number; weather_code: number } }).current
  if (!c) return null
  // WMO 코드: 51~67 이슬비·비, 71~77 눈, 80~82 소나기, 85~86 눈 소나기, 95~99 뇌우
  const w = c.weather_code
  const snow = c.snowfall > 0 || (w >= 71 && w <= 77) || w === 85 || w === 86
  const rain = c.rain > 0 || (w >= 51 && w <= 67) || (w >= 80 && w <= 82) || w >= 95
  const kind = snow && rain ? 'sleet' : snow ? 'snow' : rain ? 'rain' : null
  return { wet: kind !== null, kind, temp: c.temperature_2m, source: 'open-meteo' }
}

export async function GET() {
  const key = process.env.DATA_GO_KR_KEY
  let w: Weather | null = null
  try { if (key) w = await fromKma(key) } catch { /* 기상청 실패 → Open-Meteo */ }
  try { w ??= await fromOpenMeteo() } catch { /* 둘 다 실패 */ }
  if (!w) return Response.json({ error: 'weather_unavailable' }, { status: 502 })
  return Response.json(w, { headers: { 'cache-control': 'public, s-maxage=600, max-age=300' } })
}
