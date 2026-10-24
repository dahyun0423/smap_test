// 호실(교수연구실·강의실·사무실 등) 데이터 → 검색 장소·층별 방 목록.
// 원본: data/rooms.json(학교 캠퍼스맵) + data/door-photos.json(현장 문 앞 사진)
// 길안내 도착점은 같은 건물·층의 360 지점, 없으면 건물 대표 지점(입구까지 안내).
// scripts/check-data.ts가 node로 직접 불러오므로 상대 경로 + .ts 확장자로 import한다.
import {
  BUILDING_BY_ID,
  type BuildingId,
  IMG_BASE,
  NODES,
  type Place,
  type PlaceKind,
} from '../data/campus.ts';
import DOORS from '../data/door-photos.json' with { type: 'json' };
import { loadAllEdits } from '../data/edits.ts';
import { floorLevel } from '../data/floorPanos.ts';
import RAW from '../data/rooms.json' with { type: 'json' };

// 편집기에서 직접 입력한 층 방 목록 ('building|floor' → 목록). 있으면 학교 데이터 대신 쓴다
const FLOOR_OVERRIDE: Record<string, { h: string; n: string }[]> = { ...loadAllEdits().floorRooms };
export const setFloorRoomsLive = (
  b: BuildingId,
  floor: string,
  list: { h: string; n: string }[] | null
) => {
  if (list) FLOOR_OVERRIDE[`${b}|${floor}`] = list;
  else delete FLOOR_OVERRIDE[`${b}|${floor}`];
};

/** 호실 원본 (키를 짧게 써서 JSON 용량을 줄였다) */
export interface RawRoom {
  /** 건물 */
  b: BuildingId;
  /** 층 번호 (지하는 음수) */
  f: number | null;
  /** 호수 */
  h: string;
  /** 이름 */
  n: string;
  /** 용도 (학교 데이터 분류) */
  u: string;
  /** 문 앞 사진 파일명 */
  photo?: string;
  /** 현장에서 확인한 값 */
  field?: boolean;
}

/** 현장 사진 (door = 문 앞 호수판, board = 층 안내판) */
export interface DoorPhoto {
  p: string;
  kind: 'door' | 'board';
  b: BuildingId;
  f: number | null;
  h?: string;
  n: string;
}

export const DOOR_PHOTOS = DOORS as DoorPhoto[];

/** 문 앞 사진을 화면에 띄울지 (현재는 호실 이름 확인용으로만 사용) */
export const SHOW_DOOR_PHOTOS = false;
export const doorUrl = (p: string) => `${IMG_BASE}door/${p}.jpg`;

/** 현장에서 확인한 층 — 학교 데이터가 오래돼 이 층은 통째로 교체한다 */
const FIELD_FLOORS: { b: BuildingId; f: number; rooms: { n: string; u: string }[] }[] = [
  { b: 'bukak', f: -1, rooms: [{ n: 'GS25 편의점', u: '편의(복지)시설' }] },
  {
    b: 'chungwoon',
    f: -1,
    rooms: [
      { n: 'emart24 편의점', u: '편의(복지)시설' },
      { n: '수유리우동 (식당)', u: '편의(복지)시설' },
      { n: '노브랜드버거 (식당)', u: '편의(복지)시설' },
    ],
  },
];

// 문 앞 사진의 이름이 이런 일반 명칭이면 학교 데이터 이름(교수 이름 등)을 유지한다
const GENERIC = new Set(['교수연구실', '강의실', '실기강의실', '실기지도실', '']);

/** 전체 호실 = 학교 데이터 + 현장 사진. 문 앞 사진의 이름을 최신으로 보고, 학교 데이터에 없는 방은 추가한다 */
export const ROOMS: RawRoom[] = (() => {
  const replaced = new Set(FIELD_FLOORS.map((x) => `${x.b}|${x.f}`));
  const rooms: RawRoom[] = (RAW as RawRoom[])
    .filter((r) => !replaced.has(`${r.b}|${r.f}`))
    .map((r) => ({ ...r }));
  for (const x of FIELD_FLOORS)
    for (const r of x.rooms) rooms.push({ b: x.b, f: x.f, h: '', n: r.n, u: r.u, field: true });
  const key = (b: string, h: string) => `${b}|${h}`;
  const by = new Map(rooms.filter((r) => r.h).map((r) => [key(r.b, r.h), r]));
  for (const d of DOOR_PHOTOS) {
    if (d.kind !== 'door') continue;
    const r = d.h ? by.get(key(d.b, d.h)) : undefined;
    if (r) {
      r.photo = d.p;
      if (!GENERIC.has(d.n) && d.n !== r.n) {
        r.n = d.n;
        r.field = true;
      }
      continue;
    }
    if (!d.h && !d.n) continue;
    rooms.push({
      b: d.b,
      f: d.f,
      h: d.h ?? '',
      n: d.n || `${d.h}호`,
      u: '현장 확인',
      photo: d.p,
      field: true,
    });
  }
  return rooms;
})();

// 학교 데이터 층 번호와 현장 층 이름이 다른 경우 ('building|층번호' → 층 이름)
// 청운관: 학교 데이터 -1 = 1층(식당), 1 = L층(서점) / 유담관: 6xx호가 L층(로비)
const FLOOR_NAME: Record<string, string> = {
  'chungwoon|-1': '1층',
  'chungwoon|1': 'L층',
  'yudam|6': 'L층',
};

/** 화면 표시용 층 이름 (지하1층) */
export const floorLabel = (f: number, b?: BuildingId) =>
  FLOOR_NAME[`${b}|${f}`] ?? (f < 0 ? `지하${-f}층` : `${f}층`);
/** 360 지점 floor 값과 같은 형식의 층 이름 (B1) */
export const nodeFloor = (f: number, b?: BuildingId) =>
  FLOOR_NAME[`${b}|${f}`] ?? (f < 0 ? `B${-f}` : `${f}층`);

/** 학교 데이터 용도 → 장소 종류 (없으면 room) */
const KIND_BY_USE: Record<string, PlaceKind> = {
  교수연구실: 'professor',
  행정사무실: 'office',
  대학본부: 'office',
  국고사업: 'office',
  '편의(복지)시설': 'facility',
  입점업체: 'facility',
  휴게실: 'facility',
  도서관: 'facility',
};

// 편집기에서 지정한 층별 엘리베이터 앞 지점 ('building|floor' → 지점 id)
const ELEV: Record<string, string> = { ...loadAllEdits().elev };
export const setElevLive = (key: string, node: string | null) => {
  if (node) ELEV[key] = node;
  else delete ELEV[key];
};
export const elevPicks = () => ELEV;

/** 건물·층별 대표 지점. 우선순위: 편집기 지정 → id에 elev 포함 → 층 가운데 사진 → 아무 지점 */
export function floorNodes(): Map<string, string> {
  const score = (id: string, center?: boolean) => (id.includes('elev') ? 2 : center ? 1 : 0);
  const at = new Map<string, { id: string; s: number }>();
  for (const n of NODES)
    if (n.floor && !n.flat && !n.hidden) {
      const k = `${n.building}|${n.floor}`;
      const s = score(n.id, n.center);
      if (!at.has(k) || s > at.get(k)!.s) at.set(k, { id: n.id, s });
    }
  const out = new Map([...at].map(([k, v]) => [k, v.id]));
  for (const [k, id] of Object.entries(ELEV)) out.set(k, id);
  return out;
}

/** 호실 → 검색 장소. 그 층 대표 지점이 없으면 buildingNode(건물 입구)로 안내한다 */
export function buildRoomPlaces(buildingNode: Map<BuildingId, string>): Place[] {
  const nodeAt = floorNodes();
  const seen = new Map<string, number>();
  return ROOMS.flatMap((r, i) => {
    const bName = BUILDING_BY_ID.get(r.b)?.name ?? r.b;
    const exact = r.f !== null ? nodeAt.get(`${r.b}|${nodeFloor(r.f, r.b)}`) : undefined;
    const node = exact ?? buildingNode.get(r.b);
    if (!node) return [];
    const kind = KIND_BY_USE[r.u] ?? 'room';
    const prof = kind === 'professor' && r.n.endsWith('교수연구실');
    const who = prof ? r.n.replace(/\s*교수연구실$/, '').replace(/^.*실\s+/, '') : '';
    const name = prof ? `${who} 교수 연구실` : `${r.n}${r.h ? ` (${r.h}호)` : ''}`;
    // '행정사무실(교무처, 교육혁신처)' → 괄호 안 이름으로도 검색되게
    const inner =
      r.n
        .match(/\(([^)]+)\)/)?.[1]
        .split(/[,·]/)
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const aliases = [
      r.n,
      ...inner,
      ...(who ? [who] : []),
      ...(r.h ? [`${r.h}호`, `${bName} ${r.h}`] : []),
    ];
    const where = `${bName} ${r.f !== null ? floorLabel(r.f, r.b) : ''}`.trim();
    // 같은 호수가 두 번 나오면 id 뒤에 번호를 붙인다
    const base = `r-${r.b}-${r.h || i}`;
    const dup = seen.get(base) ?? 0;
    seen.set(base, dup + 1);
    return [
      {
        id: dup ? `${base}-${dup}` : base,
        name,
        kind,
        node,
        sub: `${where}${r.h ? ` ${r.h}호` : ''}${exact ? '' : ' · 건물 입구까지 안내'}`,
        building: r.b,
        floor: r.f !== null ? nodeFloor(r.f, r.b) : undefined,
        room: r.h || undefined,
        basis: exact ? 'floor' : 'building',
        aliases,
        photo: r.photo,
      },
    ];
  });
}

/** 그 층의 방 목록 (호수 순) */
export function roomsOnFloor(b: BuildingId, floor: string): RawRoom[] {
  const o = FLOOR_OVERRIDE[`${b}|${floor}`];
  if (o) return o.map((r) => ({ b, f: null, h: r.h, n: r.n, u: '관리자 입력' }));
  return ROOMS.filter((r) => r.b === b && r.f !== null && nodeFloor(r.f, r.b) === floor).sort(
    (p, q) => p.h.localeCompare(q.h, 'ko', { numeric: true })
  );
}

/** 그 층(없으면 건물 전체)의 안내판 사진 */
export function boardsFor(b: BuildingId, floor?: string): DoorPhoto[] {
  return DOOR_PHOTOS.filter(
    (d) =>
      d.kind === 'board' && d.b === b && (d.f === null || (floor && nodeFloor(d.f, d.b) === floor))
  );
}

/** 건물의 층 이동 버튼 목록 (낮은 층 → 높은 층) */
export function floorsOf(b: BuildingId): { floor: string; label: string; node: string }[] {
  const out: { floor: string; label: string; node: string }[] = [];
  for (const [k, node] of floorNodes()) {
    const [kb, floor] = k.split('|');
    if (kb !== b || !/층$|^B\d$/.test(floor)) continue;
    out.push({ floor, node, label: floor === 'L층' ? 'L' : floor.replace('층', 'F') });
  }
  return out.sort((p, q) => floorLevel(b, p.floor) - floorLevel(b, q.floor));
}
