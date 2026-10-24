import { BUILDING_BY_ID, EDGES, NODE_BY_ID, type PanoNode, type Via } from '@/data/campus';
import { loadAllEdits } from '@/data/edits';
import { FIXED_ELEV, elevLinesOf, floorLevel } from '@/data/floorPanos';
import yawOverrides from '@/data/yaw.json';
import { elevPicks, floorsOf } from '@/utils/rooms';

// 길 그래프 — 360 지점(노드)과 연결(엣지)로 경로를 찾고, 단계별 안내 문구와 화살표 방향을 정한다.

export interface Link {
  to: string;
  via: Via;
  note?: string;
  /** 숨긴 사진을 건너뛴 연결이면 그 사진 id */
  through?: string;
  /** 층별 엘리베이터 앞 지정으로 자동 추가된 연결 */
  auto?: boolean;
  /** 엘리베이터 노선(elevLines)으로 추가된 연결 */
  line?: boolean;
}

// ── 인접 리스트 (모든 연결은 양방향)

const ADJ = new Map<string, Link[]>();

const isLinked = (a: string, b: string) => (ADJ.get(a) ?? []).some((l) => l.to === b);

function linkBoth(a: string, b: string, link: Omit<Link, 'to'>) {
  for (const [p, q] of [
    [a, b],
    [b, a],
  ])
    ADJ.set(p, [...(ADJ.get(p) ?? []), { to: q, ...link }]);
}

function unlinkBoth(a: string, b: string, match: (l: Link) => boolean) {
  for (const [p, q] of [
    [a, b],
    [b, a],
  ])
    ADJ.set(
      p,
      (ADJ.get(p) ?? []).filter((l) => !(l.to === q && match(l)))
    );
}

for (const e of EDGES) linkBoth(e.a, e.b, { via: e.via, note: e.note });

// 층별 '엘리베이터 앞' 지점이 지정된 건물은 아래층 ↔ 위층 엘리베이터 앞을 자동으로 잇는다.
// 지정이 바뀌면 자동 연결을 지우고 다시 계산한다.
const AUTO_ELEV = new Map<string, [string, string][]>();
export function relinkElevators(b: string) {
  for (const [x, y] of AUTO_ELEV.get(b) ?? []) unlinkBoth(x, y, (l) => !!l.auto);
  AUTO_ELEV.delete(b);
  if (!Object.keys(elevPicks()).some((k) => k.startsWith(`${b}|`))) return;
  // CSV로 연결을 받은 건물·엘리베이터가 여러 대인 건물은 데이터 그대로 쓴다
  if (FIXED_ELEV(b)) return;
  const fl = floorsOf(b as Parameters<typeof floorsOf>[0]);
  const added: [string, string][] = [];
  for (let i = 1; i < fl.length; i++) {
    const [x, y] = [fl[i - 1].node, fl[i].node];
    if (isLinked(x, y)) continue;
    linkBoth(x, y, { via: 'elevator', auto: true });
    added.push([x, y]);
  }
  AUTO_ELEV.set(b, added);
}
for (const b of new Set(Object.keys(elevPicks()).map((k) => k.split('|')[0]))) relinkElevators(b);

// 엘리베이터 노선 — 엘리베이터마다 서는 층이 다른 건물은 같은 노선 사진끼리만 층 순서대로 잇는다.
const LINE_LINKS = new Map<string, [string, string][]>();
export function relinkLines(b: string) {
  for (const [x, y] of LINE_LINKS.get(b) ?? []) unlinkBoth(x, y, (l) => !!l.line);
  LINE_LINKS.delete(b);
  const added: [string, string][] = [];
  for (const line of elevLinesOf(b)) {
    const lv = (id: string) => {
      const f = NODE_BY_ID.get(id)?.floor;
      return f ? floorLevel(b as PanoNode['building'], f) : NaN;
    };
    const stops = line.nodes
      .filter((id) => NODE_BY_ID.has(id) && !Number.isNaN(lv(id)))
      .sort((p, q) => lv(p) - lv(q));
    for (let i = 1; i < stops.length; i++) {
      const [x, y] = [stops[i - 1], stops[i]];
      if (isLinked(x, y)) continue;
      linkBoth(x, y, { via: 'elevator', line: true });
      added.push([x, y]);
    }
  }
  LINE_LINKS.set(b, added);
}
for (const b of BUILDING_BY_ID.keys()) if (elevLinesOf(b).length) relinkLines(b);

const hiddenNode = (id: string) => !!NODE_BY_ID.get(id)?.hidden;

/**
 * 이 지점에서 갈 수 있는 연결. 숨긴 사진은 건너뛰고 그 너머 사진으로 바로 잇는다.
 * 건너뛴 연결에는 through(숨긴 사진 id)를 달아 화살표 방향을 그 사진 쪽으로 쓴다.
 */
export function linksOf(id: string): Link[] {
  const out: Link[] = [];
  const seen = new Set([id]);
  const walk = (from: string, through?: string, via?: Via) => {
    for (const l of ADJ.get(from) ?? []) {
      if (seen.has(l.to)) continue;
      seen.add(l.to);
      if (hiddenNode(l.to)) walk(l.to, through ?? l.to, via ?? l.via);
      else out.push(through ? { ...l, via: via!, through } : l);
    }
  };
  walk(id);
  return out;
}

/** 숨긴 사진까지 포함한 원래 연결 (편집기용) */
export const rawLinksOf = (id: string) => ADJ.get(id) ?? [];

/** 편집기에서 연결 추가·삭제를 바로 반영 (via = null이면 삭제) */
export function setLinkLive(a: string, b: string, via: Via | null) {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    const list = (ADJ.get(x) ?? []).filter((l) => l.to !== y);
    if (via) list.push({ to: y, via });
    ADJ.set(x, list);
  }
}

// ── 경로 탐색

/** 이동 방식별 기본 비용 */
const COST: Record<Via, number> = { walk: 1, door: 1, passage: 2, stairs: 2.5, elevator: 3 };

/** outdoor: 야외 길 우선 · elevator: 엘리베이터 우선 (계단은 다른 길이 없을 때만) */
export type RouteMode = 'outdoor' | 'elevator';

// 통행 불가 지점 — 출발·도착이 아니면 지나가지 않는다 (서버 제보 + 편집기에서 막은 지점)
const EDIT_BLOCKED = new Set(Object.keys(loadAllEdits().blocked));
let BLOCKED = new Set<string>(EDIT_BLOCKED);
export const setBlocked = (nodes: string[]) => {
  BLOCKED = new Set([...nodes, ...EDIT_BLOCKED]);
};

/** 편집기에서 통행 막기/풀기를 바로 반영 */
export const setBlockedLive = (node: string, on: boolean) => {
  for (const s of [EDIT_BLOCKED, BLOCKED]) {
    if (on) s.add(node);
    else s.delete(node);
  }
};

export const isBlocked = (node: string) => BLOCKED.has(node);

// 비·눈 올 때 야외 ↔ 야외 구간 가중치 (출발·도착이 야외일 수 있어 막지는 않는다)
const OUTDOOR_PENALTY = 6;
const isOutdoorLeg = (a: string, b: string) =>
  NODE_BY_ID.get(a)?.building === 'outdoor' && NODE_BY_ID.get(b)?.building === 'outdoor';
// 야외 우선 모드에서 실내 ↔ 실내 구간 가중치
const INDOOR_PENALTY = 2.5;
const isIndoorLeg = (a: string, b: string) =>
  NODE_BY_ID.get(a)?.building !== 'outdoor' && NODE_BY_ID.get(b)?.building !== 'outdoor';
// 엘리베이터 우선 모드에서 계단 가중치 (막지는 않는다)
const STAIRS_PENALTY = 12;

/** 다익스트라 최단 경로. indoor(비·눈)면 실내·지하 길을 우선하고, 이때는 mode의 야외 우선보다 앞선다 */
export function findRoute(
  from: string,
  to: string,
  mode: RouteMode = 'outdoor',
  indoor = false
): string[] | null {
  if (from === to) return [from];
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  while (true) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [k, d] of dist)
      if (!done.has(k) && d < best) {
        best = d;
        cur = k;
      }
    if (cur === null) return null;
    if (cur === to) break;
    done.add(cur);
    for (const l of linksOf(cur)) {
      if (BLOCKED.has(l.to) && l.to !== to) continue;
      const k = indoor
        ? isOutdoorLeg(cur, l.to)
          ? OUTDOOR_PENALTY
          : 1
        : mode === 'outdoor' && isIndoorLeg(cur, l.to)
          ? INDOOR_PENALTY
          : 1;
      const nd =
        best + COST[l.via] * k * (mode === 'elevator' && l.via === 'stairs' ? STAIRS_PENALTY : 1);
      if (nd < (dist.get(l.to) ?? Infinity)) {
        dist.set(l.to, nd);
        prev.set(l.to, cur);
      }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  // 엘리베이터로 여러 층을 지나는 구간은 한 단계로 합친다 ("12층에서 내리세요")
  return path.filter(
    (id, i) =>
      i === 0 ||
      i === path.length - 1 ||
      edgeBetween(path[i - 1], id)?.via !== 'elevator' ||
      edgeBetween(id, path[i + 1])?.via !== 'elevator'
  );
}

export const edgeBetween = (a: string, b: string): Link | undefined =>
  linksOf(a).find((l) => l.to === b);

/** 다음 단계가 엘리베이터로 여러 층 떨어져 있을 때, 지금 지점의 엘리베이터 연결 */
export const elevatorLinkTo = (a: string, b: string): Link | undefined =>
  edgeBetween(a, b)
    ? undefined
    : linksOf(a).find(
        (l) =>
          l.via === 'elevator' && NODE_BY_ID.get(l.to)?.building === NODE_BY_ID.get(b)?.building
      );

// ── 안내 문구

/** '건물 · 층' 표시 (야외면 빈 문자열) */
export function placeLabel(node: PanoNode): string {
  const b = node.building === 'outdoor' ? null : BUILDING_BY_ID.get(node.building)?.name;
  return [b, node.floor].filter(Boolean).join(' · ');
}

/** 한 구간(a → b)의 안내 문구 */
export function instruction(a: string, b: string): string {
  const to = NODE_BY_ID.get(b)!;
  const from = NODE_BY_ID.get(a)!;
  const l = edgeBetween(a, b);
  const floor = to.floor ?? '';
  // findRoute가 합친 엘리베이터 구간 (중간 층 생략)
  if (!l && from.building === to.building && from.floor !== to.floor)
    return `엘리베이터를 타고 ${floor}에서 내리세요`;
  switch (l?.via) {
    case 'elevator':
      return `엘리베이터를 타고 ${floor || '다음 층'}에서 내리세요`;
    case 'stairs':
      return from.floor && to.floor && from.floor !== to.floor
        ? `계단으로 ${to.floor}까지 이동하세요`
        : `계단을 따라 ${to.title}(으)로 가세요`;
    case 'passage':
      return `연결통로를 따라 ${to.title}(으)로 이동하세요`;
    case 'door':
      return `출입구를 지나 ${to.title}(으)로 들어가세요`;
    default:
      return `${to.title} 방향으로 이동하세요`;
  }
}

export const VIA_LABEL: Record<Via, string> = {
  walk: '도보',
  door: '출입구',
  passage: '연결통로',
  stairs: '계단',
  elevator: '엘리베이터',
};

// ── 화살표 방향 (yaw, 도) — 키는 'from>to'

const YAW = yawOverrides as Record<string, number>;
const LOCAL_KEY = 'smap.yaw';

export function loadLocalYaw(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveLocalYaw(v: Record<string, number>) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(v));
  } catch {
    /* 저장 불가 환경 */
  }
}

// 서버 저장값 (앱 시작 시 /api/yaw)
let REMOTE: Record<string, number> = {};
// 편집기에서 맞춘 값 (edits.json + 공유 수정값)
const EDIT_YAW: Record<string, number> = { ...loadAllEdits().yaw };
export const setEditYaw = (key: string, deg: number | null) => {
  if (deg === null) delete EDIT_YAW[key];
  else EDIT_YAW[key] = deg;
};

export const setRemoteYaw = (v: Record<string, number>) => {
  REMOTE = v;
};

/** 사람이 직접 맞춘 방향만 (편집기 → 서버 → yaw.json). 없으면 undefined */
export function knownYaw(from: string, to: string): number | undefined {
  const key = `${from}>${to}`;
  return EDIT_YAW[key] ?? REMOTE[key] ?? YAW[key];
}

/** 화살표 방향. 우선순위: 방금 보정한 값(local) → 편집기 → 서버 → yaw.json → 임시 배치 */
export function linkYaw(from: string, to: string, local: Record<string, number> = {}): number {
  const via = linksOf(from).find((l) => l.to === to)?.through;
  if (via) return linkYaw(from, via, local);
  const key = `${from}>${to}`;
  if (key in local) return local[key];
  if (key in EDIT_YAW) return EDIT_YAW[key];
  if (key in REMOTE) return REMOTE[key];
  if (key in YAW) return YAW[key];
  const links = rawLinksOf(from);
  const i = links.findIndex((l) => l.to === to);
  // 보정 전에는 정면 기준으로 고르게 펼쳐 둔다
  const spread = [0, 180, 90, -90, 45, -45, 135, -135];
  return spread[i % spread.length];
}
