// 편집기 수정값 공유 저장소 (Supabase 표 smap_edit_versions).
// - 저장할 때마다 새 버전이 한 줄씩 쌓이고, 가장 최근 버전이 현재 값이다 (RLS로 읽기·추가만 허용).
// - 앱 시작 시(main.tsx) 최신 버전을 먼저 받은 뒤 그래프를 만든다.
// - 동시에 고치면 내가 받은 값(base)과의 차이만 최신 버전 위에 합쳐 저장한다.
// anon 키는 브라우저에 노출돼도 되는 공개 키다. node 스크립트에선 env가 없을 수 있다.
const ENV = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const URL_ = ENV.VITE_SUPABASE_URL;
const KEY = ENV.VITE_SUPABASE_ANON_KEY;
const TABLE = 'smap_edit_versions';
const CACHE = 'smap.shared';
const AUTHOR = 'smap.author';

type Obj = Record<string, unknown>;
export interface SharedState {
  id: number;
  edits: Obj;
  floors: Obj;
  author?: string | null;
  created_at?: string;
}

let latest: SharedState | null = null;
// 편집기 값의 기준점. 합쳐서 저장한 뒤에도 base는 '내 화면 값'으로 둔다
// (합친 결과로 바꾸면 다음 저장 때 화면에 없는 다른 사람의 수정을 지워 버린다)
let base: SharedState | null = null;
let lastId = 0;

export const sharedEnabled = () => !!(URL_ && KEY);
/** 현재 공유 값 (없으면 null — 이 브라우저 저장소를 쓴다) */
export const sharedState = () => latest;

const headers = () => ({
  apikey: KEY!,
  Authorization: `Bearer ${KEY}`,
  'content-type': 'application/json',
});

async function fetchLatest(): Promise<SharedState | null> {
  const r = await fetch(
    `${URL_}/rest/v1/${TABLE}?select=id,edits,floors,author,created_at&order=id.desc&limit=1`,
    { headers: headers(), signal: AbortSignal.timeout(4000) }
  );
  if (!r.ok) throw new Error(String(r.status));
  const rows = (await r.json()) as SharedState[];
  return rows[0] ?? { id: 0, edits: {}, floors: {} };
}

/** 앱 시작 시 한 번 호출. 실패하면 마지막으로 받은 값(캐시)을 쓴다 */
export async function loadShared() {
  if (!sharedEnabled()) return;
  try {
    latest = await fetchLatest();
    try {
      localStorage.setItem(CACHE, JSON.stringify(latest));
    } catch {
      /* 저장 불가 */
    }
  } catch {
    try {
      latest = JSON.parse(localStorage.getItem(CACHE) ?? 'null');
    } catch {
      latest = null;
    }
  }
  base = latest && structuredClone(latest);
  lastId = latest?.id ?? 0;
}

export const getAuthor = () => {
  try {
    return localStorage.getItem(AUTHOR) ?? '';
  } catch {
    return '';
  }
};
export const setAuthor = (n: string) => {
  try {
    localStorage.setItem(AUTHOR, n);
  } catch {
    /* 저장 불가 */
  }
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** base → mine 사이에 바뀐 것만 target에 얹는다. 객체는 키별로, 배열은 항목별로 */
function rebase(target: Obj, from: Obj, mine: Obj): Obj {
  const out: Obj = structuredClone(target);
  for (const k of new Set([...Object.keys(from), ...Object.keys(mine)])) {
    const a = from[k],
      m = mine[k];
    if (same(a, m)) continue;
    if ((Array.isArray(a) || Array.isArray(m)) && same(out[k], a)) {
      if (m === undefined) delete out[k];
      // 다른 사람이 안 건드린 목록은 내 것 그대로 (순서 변경 유지)
      else out[k] = m;
    } else if (Array.isArray(a) || Array.isArray(m)) {
      const ka = new Set(((a as unknown[]) ?? []).map((x) => JSON.stringify(x)));
      const km = new Set(((m as unknown[]) ?? []).map((x) => JSON.stringify(x)));
      const cur = new Map(((out[k] as unknown[]) ?? []).map((x) => [JSON.stringify(x), x]));
      for (const x of ka) if (!km.has(x)) cur.delete(x);
      for (const x of km) if (!ka.has(x)) cur.set(x, JSON.parse(x));
      out[k] = [...cur.values()];
    } else if (a && m && typeof a === 'object' && typeof m === 'object') {
      out[k] = rebase((out[k] as Obj) ?? {}, a as Obj, m as Obj);
    } else if (m === undefined) {
      delete out[k];
    } else {
      out[k] = m;
    }
  }
  return out;
}

export type SaveResult = { ok: true; id: number; merged: boolean } | { ok: false; error: string };

/** 내 값 저장 — 그 사이 다른 사람이 저장했으면 차이만 합쳐 새 버전으로 */
export async function saveShared(edits: Obj, floors: Obj): Promise<SaveResult> {
  if (!sharedEnabled()) return { ok: false, error: 'off' };
  try {
    const now = await fetchLatest();
    const from = base ?? { id: 0, edits: {}, floors: {} };
    const merged = !!now && now.id !== lastId;
    const next = now
      ? {
          edits: rebase(now.edits, from.edits, edits),
          floors: rebase(now.floors, from.floors, floors),
        }
      : { edits, floors };
    const r = await fetch(`${URL_}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: { ...headers(), Prefer: 'return=representation' },
      body: JSON.stringify({ ...next, author: getAuthor() || null }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, error: String(r.status) };
    const [row] = (await r.json()) as SharedState[];
    latest = row;
    lastId = row.id;
    base = { ...row, edits: structuredClone(edits), floors: structuredClone(floors) };
    try {
      localStorage.setItem(CACHE, JSON.stringify(row));
    } catch {
      /* 저장 불가 */
    }
    return { ok: true, id: row.id, merged };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
