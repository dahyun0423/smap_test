// 장소 검색과 음성 문장 해석 ("북악관에서 문예관 가는 길" → 출발·도착)
import { NODES, PLACES, type Place } from '@/data/campus';
import { TASKS, type Task, UNCHECKED_NOTE } from '@/data/tasks';

/** 비교용 정규화 — 소문자, 공백·문장부호 제거 */
const norm = (s: string) => s.toLowerCase().replace(/[\s·().,!?~]/g, '');

const termsOf = (p: Place) => [p.name, ...(p.aliases ?? [])].map(norm).filter(Boolean);

// 이름별 사용 장소 수 — 여러 장소가 같이 쓰는 이름('강의실' 등)은 문장 속 언급으로 확정하지 않는다
const TERM_OWNERS = new Map<string, number>();
for (const p of PLACES)
  for (const t of new Set(termsOf(p))) TERM_OWNERS.set(t, (TERM_OWNERS.get(t) ?? 0) + 1);

const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));

/** 문장 속 용무("졸업증명서 떼려면") → 용무 사전(data/tasks.ts)의 장소 */
export function findTask(text: string): (Task & { to: Place }) | null {
  const t = norm(text);
  for (const task of TASKS) {
    if (task.keywords.some((k) => t.includes(norm(k)))) {
      const to = PLACE_BY_ID.get(task.place);
      if (to) return { ...task, to: task.dest ? { ...to, name: task.dest } : to };
    }
  }
  return null;
}

export const taskReply = (task: Task) => task.reply + (task.checked ? '' : UNCHECKED_NOTE);

export function searchPlaces(q: string, limit = 8): Place[] {
  const k = norm(q);
  if (!k) return [];
  const scored: [Place, number][] = [];
  // 용무로 찾으면 그 장소를 맨 위에
  const task = findTask(q);
  if (task)
    scored.push([
      { ...task.to, sub: `${task.label} · ${task.to.sub ?? ''}`.replace(/ · $/, '') },
      200,
    ]);
  for (const p of PLACES) {
    let s = 0;
    for (const t of termsOf(p)) {
      if (t === k) s = Math.max(s, 100);
      else if (t.startsWith(k)) s = Math.max(s, 80);
      else if (t.includes(k)) s = Math.max(s, 60);
      else if (k.includes(t) && t.length >= 2) s = Math.max(s, 50);
    }
    if (!s && p.sub && norm(p.sub).includes(k)) s = 30;
    if (s && p.id !== task?.to.id) scored.push([p, s - (p.sample ? 5 : 0)]);
  }
  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([p]) => p);
}

/** 360 지점 자체를 장소처럼 고를 수 있게 (출발지 = "지금 여기") */
export function searchNodes(q: string, limit = 5) {
  const k = norm(q);
  if (!k) return [];
  return NODES.filter((n) => !n.hidden && norm(n.title).includes(k)).slice(0, limit);
}

/** 문장 안에서 언급된 장소를 위치 순서대로 찾는다 */
function mentions(text: string): { place: Place; at: number; len: number }[] {
  const t = norm(text);
  const found: { place: Place; at: number; len: number }[] = [];
  for (const p of PLACES) {
    let hit: { at: number; len: number } | null = null;
    for (const term of termsOf(p)) {
      if (term.length < 2 || (TERM_OWNERS.get(term) ?? 0) > 1) continue;
      const at = t.indexOf(term);
      if (at >= 0 && (!hit || term.length > hit.len)) hit = { at, len: term.length };
    }
    if (hit) found.push({ place: p, ...hit });
  }
  // 겹치는 매칭은 더 긴 쪽만 남김 (예: '은주1관' vs '은주')
  found.sort((a, b) => b.len - a.len);
  const kept: typeof found = [];
  for (const f of found)
    if (!kept.some((k) => f.at < k.at + k.len && k.at < f.at + f.len)) kept.push(f);
  return kept.sort((a, b) => a.at - b.at);
}

export interface VoiceIntent {
  from?: Place;
  to?: Place;
  candidates: Place[];
  /** "계단 말고", "엘리베이터로" → 계단 없는 길 */
  avoidStairs?: boolean;
  /** AI가 만든 안내 한 마디 */
  reply?: string;
}

const AVOID_STAIRS = /계단\s*(말고|없이|빼고|피해)|엘리베이터로|엘베로|휠체어|유모차|카트|짐이/;

/** "북악관에서 유담관 어떻게 가요?" / "유담관이 어디에요" 같은 말을 출발·도착으로 해석 */
export function parseUtterance(text: string): VoiceIntent {
  return { ...parseUtteranceCore(text), avoidStairs: AVOID_STAIRS.test(text) };
}

function parseUtteranceCore(text: string): VoiceIntent {
  const m = mentions(text);
  const t = norm(text);
  const followedByFrom = (x: (typeof m)[number]) =>
    /^(에서|부터)/.test(t.slice(x.at + x.len, x.at + x.len + 3));
  // 할 일로 물으면("졸업증명서 떼려면 어디로 가요?") 용무 사전의 장소로. '~에서'가 붙은 곳은 출발지.
  const task = findTask(text);
  if (task)
    return {
      from: m.find(followedByFrom)?.place,
      to: task.to,
      candidates: [],
      reply: taskReply(task),
    };
  if (m.length >= 2) {
    // 기본은 먼저 말한 곳이 출발지. 뒤쪽 장소에 '에서/부터'가 붙으면 그쪽이 출발지.
    const fromIdx = m.findIndex(followedByFrom);
    const from = fromIdx >= 0 ? m[fromIdx] : m[0];
    const to = [...m].reverse().find((x) => x !== from)!;
    return { from: from.place, to: to.place, candidates: [] };
  }
  if (m.length === 1) return { to: m[0].place, candidates: [] };
  // 직접 매칭 실패 → 단어별 부분 검색으로 후보 제시
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/(이|가|은|는|을|를|에|에서|으로|로|어디|에요|예요|야|요)$/g, ''));
  const cands = new Map<string, Place>();
  for (const w of words) for (const p of searchPlaces(w, 3)) cands.set(p.id, p);
  return { candidates: [...cands.values()].slice(0, 4) };
}

/** AI 해석에 넘길 후보 — 문장 속 언급 + 단어별 검색 결과 + 건물 (최대 40곳) */
export function candidatesFor(text: string): Place[] {
  const out = new Map<string, Place>();
  // 용무 사전에 걸리면 그 장소를 '용무' 설명과 함께 맨 앞에 — AI가 할 일로 물어도 고를 수 있게
  const task = findTask(text);
  if (task)
    out.set(task.to.id, {
      ...task.to,
      sub: `용무: ${task.label}${task.checked ? '' : ' (담당 확인 중)'} · ${task.to.sub ?? ''}`,
    });
  for (const m of mentions(text)) if (!out.has(m.place.id)) out.set(m.place.id, m.place);
  for (const w of text.split(/\s+/)) {
    const k = w.replace(
      /(이|가|은|는|을|를|에|에서|으로|로|까지|부터|어디|에요|예요|야|요|가는|가려면)$/g,
      ''
    );
    if (k.length >= 2) for (const p of searchPlaces(k, 6)) out.set(p.id, p);
  }
  for (const p of PLACES)
    if (p.kind === 'building' || p.kind === 'facility') {
      if (out.size >= 40) break;
      out.set(p.id, p);
    }
  return [...out.values()].slice(0, 40);
}
