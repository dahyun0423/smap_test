// 서버(/api/*, Vercel Functions) 공통 요청 함수.
// 서버나 키가 없으면 조용히 실패하고, 앱은 브라우저 기능(Web Speech·규칙 해석·localStorage)으로 동작한다.

export interface Features {
  llm: boolean;
  stt: boolean;
  db: boolean;
  photo?: boolean;
}

const OFF: Features = { llm: false, stt: false, db: false, photo: false };

const isJson = (r: Response) => !!r.headers.get('content-type')?.includes('json');

let featuresPromise: Promise<Features> | null = null;

/** 서버에서 켜진 기능 (AI 해석·음성 인식·DB·사진 저장). 앱 실행 중 한 번만 요청한다 */
export function getFeatures(): Promise<Features> {
  featuresPromise ??= fetch('/api/health', { signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok && isJson(r) ? r.json() : OFF))
    .catch(() => OFF);
  return featuresPromise;
}

/** GET → JSON. 실패하면 fallback */
export async function getJson<T>(url: string, timeoutMs: number, fallback: T): Promise<T> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok && isJson(r) ? ((await r.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** POST JSON → JSON. 실패하면 null */
export async function postJson<T>(
  url: string,
  body: unknown,
  timeoutMs: number,
  headers: Record<string, string> = {}
): Promise<T | null> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

// 관리자 키 — 보정값 저장·제보 관리에 쓰고, 이 브라우저에만 기억한다
const ADMIN_KEY = 'smap.adminKey';

export const getAdminKey = () => {
  try {
    return localStorage.getItem(ADMIN_KEY) ?? '';
  } catch {
    return '';
  }
};

export const setAdminKey = (key: string) => {
  try {
    localStorage.setItem(ADMIN_KEY, key);
  } catch {
    /* 저장 불가 환경 */
  }
};
