// 층별 촬영분(건물 내부 360) → 지점·연결.
// 원본: floor-panos.json (scripts/build-floor-panos.py 생성, 건물·층은 촬영 시각으로 추정)
// 층마다 엘리베이터 앞(가운데)과 복도 양 끝을 1~5장 촬영 — 같은 묶음(g) 안은 걷기, 층과 층은 엘리베이터로 잇는다.
import type { Building, BuildingId, Edge, PanoNode } from './campus.ts';
import CHEONGUN from './cheongun.json' with { type: 'json' };
import EUNJU from './csv-eunju.json' with { type: 'json' };
import HANLIM from './csv-hanlim.json' with { type: 'json' };
import HYEIN from './csv-hyein.json' with { type: 'json' };
import MOONYE from './csv-moonye.json' with { type: 'json' };
import { type ElevLine, loadAllEdits } from './edits.ts';
import RAW from './floor-panos.json' with { type: 'json' };
import { sharedState } from './sharedEdits.ts';

export interface FloorPano {
  id: string;
  /** 원본 .insp 파일명 */
  src: string;
  /** 드라이브에서 정리한 파일명 (예: 문예관_11층_좌측계단) — 건물·층 확인 기준 */
  n?: string;
  b: BuildingId;
  f: string | null;
  /** 촬영 묶음 (같은 층 한 바퀴) */
  g: string;
  t: string;
  /** 묶음 가운데 사진 = 층에 내리자마자 보이는 곳(엘리베이터 앞)으로 본다 */
  c?: 1;
}

export const TAG_KEY = 'smap.tags';

/** 편집기에서 고친 건물·층 (공유 값, 없으면 이 브라우저 값) — 사진 id → { b, f } */
export function loadFloorEdits(): Record<string, Partial<FloorPano>> {
  const shared = sharedState();
  if (shared) return shared.floors as Record<string, Partial<FloorPano>>;
  try {
    return JSON.parse(localStorage.getItem(TAG_KEY) ?? '{}');
  } catch {
    return {}; /* 저장소 없음(빌드·스크립트) */
  }
}

/** 원본 분류 + 편집 값 */
export function loadFloorPanos(): FloorPano[] {
  const local = loadFloorEdits();
  return (RAW as FloorPano[]).map((r) => ({ ...r, ...local[r.id] }));
}

// L층의 실제 높이 (문예관 1·2·L·5 / 청운관 1·L·3 / 유담관 5·L·7)
const L_LEVEL: Partial<Record<BuildingId, number>> = { moonye: 3, chungwoon: 2, yudam: 6 };
const numLevel = (b: BuildingId, f: string) =>
  f.startsWith('B') ? -Number(f.slice(1)) : f === 'L층' ? (L_LEVEL[b] ?? 0.5) : parseInt(f);

// 편집기에서 정한 층 순서 (아래 → 위). 목록에 없는 층은 숫자 높이로 사이에 끼운다
const FLOOR_ORDER: Record<string, string[]> = { ...loadAllEdits().floorOrder };
export const floorOrderOf = (b: BuildingId) => FLOOR_ORDER[b];
export function setFloorOrderLive(b: BuildingId, order: string[] | null) {
  if (order) FLOOR_ORDER[b] = order;
  else delete FLOOR_ORDER[b];
}
export function floorLevel(b: BuildingId, f: string): number {
  const order = FLOOR_ORDER[b];
  if (!order?.length) return numLevel(b, f);
  const i = order.indexOf(f);
  if (i >= 0) return i;
  const n = numLevel(b, f);
  return order.filter((x) => numLevel(b, x) < n).length - 0.5;
}

/**
 * 엘리베이터마다 서는 층이 다른 건물의 노선 기본값. 편집기에서 고치면 edits.elevLines가 대신한다.
 * 노선이 있는 건물은 자동 엘리베이터 연결 대신 같은 노선 사진끼리만 잇는다 (graph.ts relinkLines).
 */
const ELEV_LINES: Partial<Record<BuildingId, ElevLine[]>> = {
  yudam: [
    {
      name: '엘베1',
      nodes: [
        's1013_110408',
        's1013_104212',
        's1013_110149',
        's1013_110109',
        's1013_110025',
        's1013_105937',
      ],
    },
    // 7·8층 도서관은 전용 엘리베이터로 따로 연결 — 엘베2는 L층 → 9층
    {
      name: '엘베2',
      nodes: [
        's1013_103540',
        's1013_102615',
        's1013_105513',
        's1013_105240',
        's1013_105120',
        's1013_104958',
        's1013_104901',
        's1013_104744',
      ],
    },
  ],
};
const LINES: Record<string, ElevLine[]> = { ...ELEV_LINES, ...loadAllEdits().elevLines };
export const elevLinesOf = (b: string): ElevLine[] => LINES[b] ?? [];
export function setElevLinesLive(b: string, lines: ElevLine[] | null) {
  const def = ELEV_LINES[b as BuildingId];
  if (lines) LINES[b] = lines;
  else if (def) LINES[b] = def;
  else delete LINES[b];
}
/** 노선이 있는 건물에서도 자동 연결을 유지할 층 (어느 엘리베이터인지 미확인) */
const AUTO_BELOW: Partial<Record<BuildingId, string>> = { yudam: '3층' };

// 야외 사진은 건물 대신 가까운 지도 위치에 둔다
const OUT_POS: Record<string, [number, number]> = {
  운동장: [67, 40],
  지하주차장: [46, 40],
  유담관: [30, 52],
};

/**
 * 이미 있던 지점과 이어 붙이는 곳 (추정 — 현장 확인 필요)
 * [이 묶음의 건물, 층, 기존 지점, 방식, 안내 문구]
 */
const JOINS: [BuildingId, string | null, string, Edge['via'], string?][] = [
  ['moonye', 'L층', 'moonye_1f_in', 'walk'],
  ['hyein', '1층', 'hyein_down_in', 'walk'],
  ['eunju1', '1층', 'eunju1_entrance', 'walk'],
  ['eunju1', '6층', 'eunju1_hill_in', 'walk'],
  ['hanlim', '3층', 'hanlim_in', 'walk'],
  ['bonkwan', '2층', 'bon_2f_front', 'walk'],
  ['yudam', '9층', 'yudam_9f', 'walk'],
  ['outdoor', '운동장', 'field', 'walk'],
  ['outdoor', '지하주차장', 'parking_3way', 'walk'],
];

// 연결을 CSV로 직접 정리한 건물 — 자동 연결 대신 그 데이터를 쓴다
// 청운관: scripts/import-cheongun.py → cheongun.json
// 문예관·혜인관·한림관·은주1관: scripts/import-building-csv.py → csv-<건물>.json
const MANUAL: Partial<Record<BuildingId, Edge[]>> = {
  chungwoon: CHEONGUN.edges as Edge[],
  moonye: MOONYE.edges as Edge[],
  hyein: HYEIN.edges as Edge[],
  hanlim: HANLIM.edges as Edge[],
  eunju1: EUNJU.edges as Edge[],
};
/** 엘리베이터 연결이 데이터로 정해진 건물 — '엘리베이터 앞' 지정은 층 버튼만 바꾸고 연결은 만들지 않는다 */
export const FIXED_ELEV = (b: string) => b in MANUAL || elevLinesOf(b).length > 0;
// CSV에 입구 사진이 없는 건물은 바깥 입구와 JOINS로 잇는다
const KEEP_JOINS = new Set<BuildingId>(['eunju1']);

export function buildFloorGraph(
  rows: FloorPano[],
  buildings: Map<BuildingId, Building>
): { nodes: PanoNode[]; edges: Edge[] } {
  const nodes: PanoNode[] = [];
  const edges: Edge[] = [];
  const groups = new Map<string, FloorPano[]>();
  // 같은 묶음이라도 건물·층을 다르게 고친 사진은 따로 묶는다
  for (const r of rows) {
    const k = `${r.g}|${r.b}|${r.f}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const center = (g: FloorPano[]) => (g.find((r) => r.c) ?? g[Math.floor((g.length - 1) / 2)]).id;

  for (const r of rows) {
    const bld = buildings.get(r.b);
    const outKey = Object.keys(OUT_POS).find((k) => r.t.includes(k));
    const [x, y] = bld ? [bld.x, bld.y] : OUT_POS[outKey ?? '운동장'];
    nodes.push({
      id: r.id,
      title: r.t,
      building: r.b,
      floor: r.f ?? undefined,
      x,
      y,
      level: r.f?.startsWith('B') ? 'underground' : undefined,
      estimated: true,
    });
  }

  // 같은 묶음 안: 찍은 순서대로 걷기
  for (const g of groups.values())
    if (!MANUAL[g[0].b])
      for (let i = 1; i < g.length; i++) edges.push({ a: g[i - 1].id, b: g[i].id, via: 'walk' });

  // 층 대표(가장 큰 묶음의 가운데)끼리 엘리베이터, 같은 층의 다른 묶음은 대표와 걷기로 잇는다
  const perFloor = new Map<string, FloorPano[][]>(); // `${b}|${f}` → 묶음들
  for (const g of groups.values()) {
    const key = `${g[0].b}|${g[0].f ?? g[0].t}`;
    perFloor.set(key, [...(perFloor.get(key) ?? []), g]);
  }
  const rep = new Map<string, string>(); // `${b}|${f}` → 대표 지점
  for (const [key, gs] of perFloor) {
    const main = gs.reduce((a, g) => (g.length > a.length ? g : a));
    rep.set(key, center(main));
    if (!MANUAL[gs[0][0].b])
      for (const g of gs)
        if (g !== main) edges.push({ a: rep.get(key)!, b: center(g), via: 'walk' });
  }
  // 층 대표 = 길안내 도착점·층 버튼이 가는 곳
  const reps = new Set(rep.values());
  for (const n of nodes) if (reps.has(n.id)) n.center = true;
  const byBuilding = new Map<BuildingId, { f: string; id: string }[]>();
  for (const [key, id] of rep) {
    const [b, f] = key.split('|') as [BuildingId, string];
    if (b === 'outdoor' || MANUAL[b] || !/층$|^B\d$/.test(f)) continue;
    byBuilding.set(b, [...(byBuilding.get(b) ?? []), { f, id }]);
  }
  for (const [b, all] of byBuilding) {
    const below = AUTO_BELOW[b];
    const list = elevLinesOf(b).length
      ? all.filter((x) => below !== undefined && floorLevel(b, x.f) <= floorLevel(b, below))
      : all;
    list.sort((p, q) => floorLevel(b, q.f) - floorLevel(b, p.f));
    for (let i = 1; i < list.length; i++)
      edges.push({ a: list[i - 1].id, b: list[i].id, via: 'elevator' });
  }

  // 은주1관 2층 → 한림관 3층 → 본관 5층 연결통로 (사진 속 안내판 "본관 5F · 한림관 3F")
  const joinRep = (b: BuildingId, f: string) => rep.get(`${b}|${f}`);
  const passage = (a?: string, z?: string, note?: string) => {
    if (a && z) edges.push({ a, b: z, via: 'passage', note });
  };
  passage(
    joinRep('eunju1', '2층'),
    HANLIM.nodes.HL03_EUNJU_STAIRS,
    '은주1관 2층에서 한림관 3층으로 이어져요.'
  );
  passage(
    HANLIM.nodes.HL03_MAIN_LINK,
    joinRep('bonkwan', '5층'),
    '한림관 3층과 본관 5층은 연결통로로 이어져요.'
  );
  // CSV에 없는 건물 간 연결 (추정, 현장 확인 필요)
  const linkCsv = (a?: string, z?: string, via: Edge['via'] = 'walk') => {
    if (a && z) edges.push({ a, b: z, via });
  };
  linkCsv(MOONYE.nodes.MY06_BU07_CONNECT, 's1012_105611');
  linkCsv('s1012_105611', 's1012_105634', 'stairs');
  linkCsv(HANLIM.nodes.HL06_EUNJU_PATH, EUNJU.nodes.EJ1_05_HANLIM_LINK, 'passage');

  // 유담관 바깥 도로·주차장 출입구
  const firstWith = (s: string) => rows.find((r) => r.t.includes(s))?.id;
  const door = (a?: string, z?: string) => {
    if (a && z) edges.push({ a, b: z, via: 'door' });
  };
  door(joinRep('yudam', '3층'), firstWith('유담관 3층 출입구 앞'));
  door(firstWith('유담관 3층 출입구 앞'), firstWith('유담관 옆 도로'));
  door(firstWith('유담관 옆 도로'), firstWith('유담관 주차장 출입구'));
  door(firstWith('유담관 주차장 출입구'), joinRep('yudam', '2층'));
  door(firstWith('유담관 위 광장'), joinRep('yudam', '9층'));
  door('s1013_110408', 's1013_110442'); // 유담관 3층 유담엘베1앞 ↔ 엘베1쪽 바깥
  door(firstWith('지하주차장 북악관 출입구'), 'bukak_b1_elev');
  door(firstWith('지하주차장 옆 데크'), firstWith('지하주차장 연결로'));
  door(rows.find((r) => r.t.includes('은주1관 6층'))?.id, firstWith('운동장'));

  for (const list of Object.values(MANUAL)) edges.push(...list);
  for (const [b, f, existing, via, note] of JOINS) {
    if (MANUAL[b] && !KEEP_JOINS.has(b)) continue; // CSV에 입구 연결까지 들어 있음
    const id = b === 'outdoor' ? firstWith(f!) : joinRep(b, f!);
    if (id) edges.push({ a: id, b: existing, via, note });
  }
  // 같은 두 지점 사이 연결은 하나만, 자기 자신으로 가는 연결은 빼기
  const seen = new Set<string>();
  const uniq = edges.filter((e) => {
    const k = [e.a, e.b].sort().join('|');
    if (e.a === e.b || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { nodes, edges: uniq };
}
