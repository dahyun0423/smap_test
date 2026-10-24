// 편집기(?tag=1) 수정값 — 이름, 연결, 화살표 방향, 통행 막기, 방 목록, 숨긴 사진 등.
// 최종값 = edits.json(반영본) + 공유 저장소(sharedEdits.ts) 또는 이 브라우저(localStorage) 값.
// 길 그래프는 앱 시작 시 한 번 만들어지므로, 편집기 밖에서는 새로고침해야 반영된다.
import type { Edge, PanoNode } from './campus.ts';
import BASE from './edits.json' with { type: 'json' };
import { sharedState } from './sharedEdits.ts';

export const EDIT_KEY = 'smap.edits';

/** 360 사진 위 표시 — block: 출입 제한(반투명 ✕) · label: 장소 이름표 */
export interface Mark {
  /** 없으면 block */
  kind?: 'block' | 'label';
  yaw: number;
  pitch: number;
  /** 늘 보이는 한 줄 (✕ 아래 문구 / 이름표 이름) */
  title: string;
  /** 누르면 나오는 설명 */
  desc: string;
}

export interface Edits {
  /** 지점 id → 고친 설명(title) */
  titles: Record<string, string>;
  /** 새로 이은 연결 */
  add: Edge[];
  /** 끊은 연결 (linkKey) */
  remove: string[];
  /** 지점 id → 이 자리에서 층 방 목록을 띄울지 (없으면 층 대표 지점에서만 자동으로) */
  rooms: Record<string, boolean>;
  /** 화살표 방향 'from>to' → yaw(도) */
  yaw: Record<string, number>;
  /** 통행 막은 지점 id → 사유 (길안내가 돌아간다) */
  blocked: Record<string, string>;
  /** 층 방 목록 직접 입력 'building|floor' → [{h 호수, n 이름}] */
  floorRooms: Record<string, { h: string; n: string }[]>;
  /** 숨긴 사진 — 앱에서 빠지고, 길은 그 사진을 건너뛰어 앞뒤 사진끼리 이어진다 */
  hidden: Record<string, true>;
  /** 장소 id → 도착 사진 id (기본은 그 층 대표 사진) */
  placeNode: Record<string, string>;
  /** 지점 id → 사진 속 출입 제한 표시 */
  marks: Record<string, Mark[]>;
  /** 'building|floor' → 그 층 엘리베이터 앞 사진 (층 버튼 이동 위치, 위·아래층 자동 연결) */
  elev: Record<string, string>;
  /** 건물 → 층 순서 (아래 → 위, 예: ['5층', 'L층', '7층']). 없으면 숫자 순 */
  floorOrder?: Record<string, string[]>;
  /** 건물 → 엘리베이터 노선 (같은 노선 사진끼리만 층 순서대로 잇는다) */
  elevLines?: Record<string, ElevLine[]>;
}

/** 엘리베이터 한 대 — 서는 층마다 내리면 보이는 사진 하나 */
export interface ElevLine {
  name: string;
  nodes: string[];
}

const EMPTY: Edits = {
  titles: {},
  add: [],
  remove: [],
  rooms: {},
  yaw: {},
  blocked: {},
  floorRooms: {},
  hidden: {},
  placeNode: {},
  marks: {},
  elev: {},
};

/** 방향 없는 연결 키 — 'a|b' (가나다순) */
export const linkKey = (a: string, b: string) => [a, b].sort().join('|');

/** 편집기가 읽고 쓰는 값 — 공유 저장소가 켜져 있으면 최신 공유 버전, 아니면 이 브라우저 값 */
export function loadEdits(): Edits {
  const shared = sharedState();
  if (shared) return { ...EMPTY, ...(shared.edits as Partial<Edits>) };
  return loadLegacyEdits();
}

/** 이 브라우저에만 저장된 예전 값 — 공유 저장소로 옮길 때 읽는다 */
export function loadLegacyEdits(): Edits {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(EDIT_KEY) ?? '{}') };
  } catch {
    return EMPTY;
  }
}

/** 반영된 값(edits.json)만 — 편집기 되돌리기에서 원래 값으로 쓴다 */
export const BASE_EDITS = { ...EMPTY, ...BASE } as Edits;

/** edits.json + 편집 값 — 그래프를 만들 때 쓴다 */
export function loadAllEdits(): Edits {
  const base = BASE_EDITS;
  const local = loadEdits();
  const localKeys = new Set([...local.add.map((x) => linkKey(x.a, x.b)), ...local.remove]);
  return {
    titles: { ...base.titles, ...local.titles },
    rooms: { ...base.rooms, ...local.rooms },
    yaw: { ...base.yaw, ...local.yaw },
    blocked: { ...base.blocked, ...local.blocked },
    floorRooms: { ...base.floorRooms, ...local.floorRooms },
    hidden: { ...base.hidden, ...local.hidden },
    placeNode: { ...base.placeNode, ...local.placeNode },
    marks: { ...base.marks, ...local.marks },
    elev: { ...base.elev, ...local.elev },
    floorOrder: { ...base.floorOrder, ...local.floorOrder },
    elevLines: { ...base.elevLines, ...local.elevLines },
    add: [...base.add.filter((x) => !localKeys.has(linkKey(x.a, x.b))), ...local.add],
    remove: [...base.remove.filter((k) => !localKeys.has(k)), ...local.remove],
  };
}

/** 이 브라우저에 저장 (공유 저장소가 켜져 있으면 백업 키에만 — 공유 저장은 saveShared) */
export function saveEdits(e: Edits) {
  try {
    localStorage.setItem(sharedState() ? `${EDIT_KEY}.backup` : EDIT_KEY, JSON.stringify(e));
  } catch {
    /* 저장 불가 */
  }
}

export const editCount = (e: Edits) =>
  Object.keys(e.titles).length +
  e.add.length +
  e.remove.length +
  Object.keys(e.rooms).length +
  Object.keys(e.yaw).length +
  Object.keys(e.blocked).length +
  Object.keys(e.floorRooms).length +
  Object.keys(e.hidden).length +
  Object.keys(e.placeNode).length +
  Object.keys(e.marks).length +
  Object.keys(e.elev ?? {}).length +
  Object.keys(e.floorOrder ?? {}).length +
  Object.keys(e.elevLines ?? {}).length;

/** 설명·방 목록 고친 값을 지점에 덮어쓴다 */
export function applyNodeEdits(nodes: PanoNode[], e: Edits): PanoNode[] {
  return nodes.map((n) => ({
    ...n,
    ...(e.titles[n.id] ? { title: e.titles[n.id] } : {}),
    ...(n.id in e.rooms ? { roomList: e.rooms[n.id] } : {}),
    ...(e.hidden[n.id] ? { hidden: true } : {}),
  }));
}

/** 끊은 연결은 빼고, 새 연결은 더한다 (같은 두 지점이면 새 연결이 이긴다) */
export function applyLinks(edges: Edge[], e: Edits): Edge[] {
  const drop = new Set([...e.remove, ...e.add.map((x) => linkKey(x.a, x.b))]);
  return [...edges.filter((x) => !drop.has(linkKey(x.a, x.b))), ...e.add];
}
