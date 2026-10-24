// 편집기 내보내기 — 팀 CSV 양식(nodes·edges) + 장소 매핑(places) + README + 편집 내역 JSON을 zip 하나로 받는다.
// node_id: CSV로 받은 건물(청운·문예·혜인·한림·은주관)은 CSV ID(CW05_E 등), 나머지는 앱 사진 id.
// 모든 연결은 양방향이라 edges에는 방향별로 한 행씩 쓴다.
import {
  BUILDING_BY_ID,
  type BuildingId,
  NODES,
  NODE_BY_ID,
  PLACES,
  type PanoNode,
} from '@/data/campus';
import CHEONGUN from '@/data/cheongun.json' with { type: 'json' };
import EUNJU from '@/data/csv-eunju.json' with { type: 'json' };
import HANLIM from '@/data/csv-hanlim.json' with { type: 'json' };
import HYEIN from '@/data/csv-hyein.json' with { type: 'json' };
import MOONYE from '@/data/csv-moonye.json' with { type: 'json' };
import DRIVE_NAMES from '@/data/drive-names.json' with { type: 'json' };
import { type Edits, linkKey } from '@/data/edits';
import { elevLinesOf, loadFloorPanos } from '@/data/floorPanos';
import { isBlocked, knownYaw, rawLinksOf } from '@/utils/graph';
import { marksOf } from '@/utils/marks';
import { makeZip } from '@/utils/zip';

const FLOOR = new Map(loadFloorPanos().map((r) => [r.id, r]));
// 건물별 CSV — nodes: CSV ID → 앱 사진 id, edges: 연결과 이동 시간(초)
const BUILDING_CSV: {
  name: string;
  nodes: Record<string, string>;
  edges: { a: string; b: string; sec?: number; also?: { via: string; sec: number }[] }[];
}[] = [
  { name: '청운관', ...CHEONGUN },
  { name: '문예관', ...MOONYE },
  { name: '혜인관', ...HYEIN },
  { name: '한림관', ...HANLIM },
  { name: '은주1·2관', ...EUNJU },
];
const CSV_ID = new Map(
  BUILDING_CSV.flatMap((c) => Object.entries(c.nodes).map(([csvId, id]) => [id, csvId] as const))
);
const CSV_EDGE_SRC = new Map(
  BUILDING_CSV.flatMap((c) => c.edges.map((e) => [linkKey(e.a, e.b), c.name] as const))
);
const CSV_SEC = new Map(
  BUILDING_CSV.flatMap((c) => c.edges.map((e) => [linkKey(e.a, e.b), e.sec] as const))
);
// 같은 두 사진 사이의 다른 이동 방식(엘리베이터 구간의 계단 등) — 방식마다 한 행씩 더 쓴다
const CSV_ALSO = new Map(
  BUILDING_CSV.flatMap((c) =>
    c.edges.filter((e) => e.also).map((e) => [linkKey(e.a, e.b), e.also!] as const)
  )
);
const DRIVE = DRIVE_NAMES as Record<string, string>;

// ── CSV 셀 변환

const csvId = (id: string) => CSV_ID.get(id) ?? id;
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 붙인다 */
const toCsv = (head: string[], rows: unknown[][]) =>
  '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
const bName = (b: BuildingId) => (b === 'outdoor' ? '야외' : (BUILDING_BY_ID.get(b)?.name ?? b));
/** '5층' → '5' */
const floorLabel = (f?: string) => f?.replace(/층$/, '') ?? '';
/** '청운관 5층 엘리베이터 앞' → '엘리베이터 앞' */
const location = (n: PanoNode) =>
  n.title
    .replace(bName(n.building), '')
    .replace(n.floor ?? '\u0000', '')
    .trim() || n.title;
/** 드라이브 원본 파일명 */
const driveName = (id: string) => FLOOR.get(id)?.n ?? DRIVE[id];
/** 파일명 오타 정리 제안 (11충 → 11층 등) */
const tidy = (s: string) => s.replace(/충(?=_|$)/g, '층').replace(/^청원관/, '청운관');
/** 엘리베이터 그룹 — 노선이 있으면 그 이름(YUDAM_엘베1), 없으면 건물당 하나(_E1) */
const elevGroup = (n: PanoNode) => {
  const line = elevLinesOf(n.building).find((l) => l.nodes.includes(n.id));
  if (line) return `${n.building.toUpperCase()}_${line.name}`;
  return rawLinksOf(n.id).some((l) => l.via === 'elevator') ? `${n.building.toUpperCase()}_E1` : '';
};

/** scope 건물(null = 전체)의 CSV zip을 내려받는다 */
export function exportZip(edits: Edits, floors: Record<string, unknown>, scope: BuildingId | null) {
  const inScope = (n?: PanoNode) => !!n && !n.flat && (!scope || n.building === scope);
  const nodes = NODES.filter(inScope);
  const ids = new Set(nodes.map((n) => n.id));
  const touched = (id: string) =>
    !!(edits.titles[id] || floors[id] || id in edits.rooms || id in edits.yaw);

  const nodeRows = nodes.map((n) => {
    const d = driveName(n.id);
    const out = rawLinksOf(n.id)
      .filter((l) => !ids.has(l.to))
      .map((l) => NODE_BY_ID.get(l.to)?.title ?? l.to);
    const scopeTag = n.hidden
      ? 'HIDDEN'
      : isBlocked(n.id)
        ? 'BLOCKED'
        : CSV_ID.has(n.id)
          ? 'CSV_HYUNGANG'
          : rawLinksOf(n.id).length
            ? touched(n.id)
              ? 'EDITED'
              : 'CONNECTED'
            : 'PENDING_CONNECTION';
    const notes = [
      n.hidden && '편집기에서 숨김 (사용자 앱에서 빠짐)',
      isBlocked(n.id) && `통행 막음${edits.blocked[n.id] ? `: ${edits.blocked[n.id]}` : ''}`,
      n.estimated && !CSV_ID.has(n.id) && !touched(n.id) && '건물·층은 촬영 시각으로 추정',
      out.length && `다른 건물/범위로 이어짐: ${out.join(' / ')}`,
      ...marksOf(n.id).map(
        (m) =>
          `${m.kind === 'label' ? '이름표' : '출입 제한 표시'}(yaw ${m.yaw}, pitch ${m.pitch}): ${m.title}${m.desc ? ` — ${m.desc}` : ''}`
      ),
    ]
      .filter(Boolean)
      .join('; ');
    return [
      csvId(n.id),
      bName(n.building),
      floorLabel(n.floor),
      location(n),
      d ? `${d}.jpg` : '',
      d ? `${tidy(d)}.jpg` : '',
      '',
      '',
      '',
      elevGroup(n),
      scopeTag,
      notes,
      n.title,
      n.id,
    ];
  });

  const added = new Set(edits.add.map((e) => linkKey(e.a, e.b)));
  const edgeRows: unknown[][] = [];
  for (const n of nodes)
    for (const l of rawLinksOf(n.id)) {
      if (!ids.has(l.to)) continue;
      const k = linkKey(n.id, l.to);
      const [basis, verification] = added.has(k)
        ? ['SMAP 편집기에서 연결', 'EDITOR']
        : l.line
          ? ['SMAP 편집기 엘리베이터 노선', 'EDITOR']
          : CSV_EDGE_SRC.has(k)
            ? [`팀 ${CSV_EDGE_SRC.get(k)} CSV`, 'USER_PROVIDED']
            : n.estimated || NODE_BY_ID.get(l.to)?.estimated
              ? ['촬영 순서·층 대표로 자동 연결', 'AUTO_ESTIMATED']
              : ['기존 앱 데이터(현장 답사)', 'APP_BASE'];
      edgeRows.push([
        csvId(n.id),
        csvId(l.to),
        l.via.toUpperCase(),
        CSV_SEC.get(k) ?? '',
        l.via === 'elevator' ? elevGroup(n) : '',
        basis,
        verification,
        knownYaw(n.id, l.to) ?? '',
      ]);
      for (const x of CSV_ALSO.get(k) ?? [])
        if (x.via !== l.via)
          edgeRows.push([
            csvId(n.id),
            csvId(l.to),
            x.via.toUpperCase(),
            x.sec,
            '',
            basis,
            verification,
            knownYaw(n.id, l.to) ?? '',
          ]);
    }

  const places = PLACES.filter(
    (p) => !scope || NODE_BY_ID.get(p.node)?.building === scope || p.building === scope
  );
  const placeRows = places.map((p) => {
    const n = NODE_BY_ID.get(p.node);
    const basis =
      p.basis === 'editor'
        ? 'EDITOR'
        : p.basis === 'floor'
          ? 'FLOOR_DEFAULT'
          : p.basis === 'building'
            ? 'BUILDING_ENTRANCE'
            : 'APP_BASE';
    return [
      p.id,
      p.name,
      p.kind,
      p.building ? bName(p.building) : n ? bName(n.building) : '',
      floorLabel(p.floor),
      p.room ?? '',
      csvId(p.node),
      n?.title ?? '',
      p.photo ? `door/${p.photo}.jpg` : '',
      basis,
      (p.aliases ?? []).join(' | '),
      p.sub ?? '',
    ];
  });

  const prefix = scope ? (scope === 'chungwoon' ? 'cheongun' : scope) : 'smap';
  const day = new Date().toISOString().slice(0, 10);
  const blob = makeZip([
    {
      name: `${prefix}_nodes.csv`,
      text: toCsv(
        [
          'node_id',
          'building',
          'floor_label',
          'location',
          'original_filename',
          'normalized_filename',
          'drive_file_id',
          'drive_url',
          's3_key',
          'elevator_group',
          'route_scope',
          'notes',
          'app_title',
          'app_photo_id',
        ],
        nodeRows
      ),
    },
    {
      name: `${prefix}_edges.csv`,
      text: toCsv(
        [
          'from_node_id',
          'to_node_id',
          'move_type',
          'time_seconds',
          'elevator_group',
          'basis',
          'verification',
          'arrow_yaw_deg',
        ],
        edgeRows
      ),
    },
    {
      name: `${prefix}_places.csv`,
      text: toCsv(
        [
          'place_id',
          'name',
          'kind',
          'building',
          'floor_label',
          'room_no',
          'arrive_node_id',
          'arrive_node_title',
          'door_photo',
          'mapping_basis',
          'aliases',
          'sub',
        ],
        placeRows
      ),
    },
    {
      name: 'README.txt',
      text: readme(
        scope ? bName(scope) : '전체 캠퍼스',
        nodeRows.length,
        edgeRows.length,
        placeRows.length,
        day
      ),
    },
    {
      name: `smap-수정내역-${day}.json`,
      text: JSON.stringify(
        { exportedAt: new Date().toISOString(), floorPanos: floors, ...edits },
        null,
        2
      ),
    },
  ]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${prefix}_csv_${day}.zip`;
  a.click();
}

const readme = (
  scope: string,
  n: number,
  e: number,
  p: number,
  day: string
) => `SMAP 길찾기 CSV (${scope}, ${day}, SMAP 사진 편집기에서 내보냄)
양식은 팀 청운관 CSV(cheongun_nodes / cheongun_edges)와 같고, 뒤에 칼럼 몇 개와 places.csv를 더했다. UTF-8 BOM.

1. *_nodes.csv (${n}행) — 지점과 사진
  node_id: 팀 CSV로 받은 건물(청운·문예·혜인·한림·은주관)은 CSV ID(CW05_E, MY05_CENTER …), 나머지는 앱 사진 id. edges·places가 이 값을 참조한다.
  building, floor_label(층, '층' 없이: 5, L, B1), location(위치 설명)
  original_filename: 드라이브 파일명. normalized_filename: 오타 정리 제안(11충→11층 등)
  drive_file_id / drive_url / s3_key: 빈칸 (업로드 후 채움)
  elevator_group: 엘리베이터 연결이 있는 지점의 그룹(건물ID_E1)
  route_scope: CSV_HYUNGANG(팀 CSV) · CONNECTED · EDITED(편집기에서 고침) · HIDDEN(숨긴 사진, 사용자 앱에서 빠짐) · BLOCKED(통행 막음) · PENDING_CONNECTION(연결 없음)
  notes: 숨김/통행 사유, 추정 여부, 범위 밖으로 이어진 지점, 출입 제한 표시(사진 속 ✕ 위치·문구·설명)
  app_title: 앱 화면·음성에 나오는 이름. app_photo_id: 앱 사진 파일(public/pano/<id>.jpg)

2. *_edges.csv (${e}행, 방향·이동 방식별 한 행 — 엘리베이터·계단 둘 다 되는 구간은 팀 CSV처럼 두 줄) — 직접 이동 가능한 다음 지점
  move_type: WALK · ELEVATOR · STAIRS · PASSAGE(연결통로) · DOOR(출입구)
  time_seconds: 팀 CSV 구간만 값 있음(나머지 빈칸)
  basis / verification: EDITOR(편집기에서 연결) · USER_PROVIDED(팀 CSV) · AUTO_ESTIMATED(촬영 순서로 자동 연결, 확인 필요) · APP_BASE(기존 현장 답사 데이터)
  arrow_yaw_deg: 사진 속 화살표 방향(도, 정면 0). 빈칸이면 아직 안 맞춤.

3. *_places.csv (${p}행) — "○○ 교수님 연구실로 안내해줘" 같은 장소 → 도착 사진
  place_id, name(검색에 나오는 이름), kind(professor·room·office·facility·building), building, floor_label, room_no(호수)
  arrive_node_id: 길안내 도착 지점(nodes.node_id). arrive_node_title: 그 사진 이름
  door_photo: 현장에서 찍은 문 앞 사진(public/door/…) — 도착 후 보여주는 사진
  mapping_basis: EDITOR(편집기에서 문 앞 가까운 사진으로 지정) · FLOOR_DEFAULT(그 층 대표=엘리베이터 앞) · BUILDING_ENTRANCE(그 층 사진이 없어 건물 입구까지) · APP_BASE
  aliases: 검색 별칭(교수 이름, 호수 등, ' | ' 구분)

4. smap-수정내역-*.json — 편집기 수정 원본. 개발자가 src/data/edits.json·floor-panos.json에 반영(옵시디언 SMAP/18 노트).
`;
