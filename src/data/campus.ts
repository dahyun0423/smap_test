// 캠퍼스 데이터 — 건물(BUILDINGS)·360 지점(NODES)·연결(EDGES)·검색 장소(PLACES).
// 지점 연결과 지도 좌표 일부는 추정값이라 현장 확인이 필요하다.
// scripts/check-data.ts가 node로 직접 불러오므로 상대 경로 + .ts 확장자로 import한다.
import { buildRoomPlaces } from '../utils/rooms.ts';
import { applyLinks, applyNodeEdits, loadAllEdits } from './edits.ts';
import { buildFloorGraph, loadFloorEdits, loadFloorPanos } from './floorPanos.ts';

export type BuildingId =
  | 'yudam'
  | 'bukak'
  | 'moonye'
  | 'daeil'
  | 'sangseung'
  | 'chungwoon'
  | 'hyein'
  | 'eunju1'
  | 'eunju2'
  | 'hanlim'
  | 'bonkwan'
  | 'suin'
  | 'creative'
  | 'outdoor';

export type Level = 'ground' | 'underground';

export interface PanoNode {
  id: string;
  title: string;
  building: BuildingId;
  floor?: string;
  /** 미니맵 위 위치 (이미지 대비 %) */
  x: number;
  y: number;
  level?: Level;
  /** 360이 아닌 일반 사진 */
  flat?: boolean;
  /** 건물·층을 촬영 시각으로 추정한 지점 */
  estimated?: boolean;
  /** 그 층에 내리자마자 보이는 곳 (층 대표 지점) */
  center?: boolean;
  /** 이 자리에서 층 방 목록을 띄울지 (없으면 층 대표 지점에서만) */
  roomList?: boolean;
  /** 편집기에서 숨긴 사진 — 검색·위치·길찾기에서 빠진다 */
  hidden?: boolean;
}

/** walk: 걷기 · door: 출입구 · passage: 연결통로 · stairs: 계단 · elevator: 엘리베이터 */
export type Via = 'walk' | 'door' | 'passage' | 'stairs' | 'elevator';

export interface Edge {
  a: string;
  b: string;
  via: Via;
  /** 안내 문구 보충 (선택) */
  note?: string;
  /** 예상 이동 시간(초) — CSV로 받은 구간만 있음. 길찾기 비용엔 아직 미사용 */
  sec?: number;
}

export interface Building {
  id: BuildingId;
  name: string;
  x: number;
  y: number;
  desc: string;
  /** 학교 캠퍼스맵(skuniv.ac.kr/campus-map)에 적힌 학과·용도 */
  depts?: string;
  /** 대표 사진 public/building/<id>.jpg (school: 학교 캠퍼스맵 사진, smap: 360 사진에서 자름) */
  photo?: 'school' | 'smap';
}

export const BUILDINGS: Building[] = [
  {
    id: 'yudam',
    name: '유담관',
    x: 24,
    y: 47,
    desc: '9층이 버스정류장과 바로 이어지고, 로비는 L층(6층 자리, 6층은 없음)에 있어요. 제2주차장(2층)과 연결.',
    depts: '공공인재학부, 예술교육원',
    photo: 'school',
  },
  {
    id: 'bukak',
    name: '북악관',
    x: 21,
    y: 15,
    desc: '지하1층에 GS25 편의점. 지하1층은 본관 2층과 지하통로로 이어져요.',
    depts: '컴퓨터 실습실, 교수연구실',
    photo: 'school',
  },
  {
    id: 'bonkwan',
    name: '본관',
    x: 30,
    y: 28,
    desc: '행정부서가 모여 있어요. 5층 연결통로는 한림관 3층과 이어져요.',
    depts: '군사학과',
    photo: 'school',
  },
  {
    id: 'moonye',
    name: '문예관',
    x: 40,
    y: 18,
    desc: '북악관 7층에서 폭풍의언덕을 지나 이어지는 숨은 길이 있어요.',
    photo: 'school',
  },
  {
    id: 'hanlim',
    name: '한림관',
    x: 45,
    y: 33,
    desc: '원형 건물. 3층 원형 연결통로가 은주1관·본관과 이어져요.',
    depts: '교양, 교수연구실습실, 예술교육원',
    photo: 'school',
  },
  {
    id: 'daeil',
    name: '대일관',
    x: 58,
    y: 24,
    desc: '1층 좌측길로 지하1층 제1주차장까지 이어져요. 7층에 연습실.',
    depts: '토목공학과, 실용음악학과, 미용예술학과, 무용예술학과',
    photo: 'school',
  },
  {
    id: 'sangseung',
    name: '상승관',
    x: 71,
    y: 26,
    desc: '대일관과 청운관 사이 별관. 제206학생군사교육단(ROTC) 사용.',
    depts: '제206학생군사교육단(R.O.T.C)',
    photo: 'smap',
  },
  {
    id: 'chungwoon',
    name: '청운관',
    x: 81,
    y: 31,
    desc: '계단 위·계단 밑 두 출입구가 있어요.',
    depts: '연구소, 교수연구실',
    photo: 'school',
  },
  {
    id: 'hyein',
    name: '혜인관',
    x: 83,
    y: 49,
    desc: '계단 밑 출입구는 지하1층 제1주차장과 이어져요.',
    depts: '디자인학부, 영화영상학과',
    photo: 'school',
  },
  {
    id: 'eunju1',
    name: '은주1관',
    x: 51,
    y: 45,
    desc: '1층은 도로, 6층은 스콘스퀘어(운동장)와 연결돼요. 2층은 한림관 3층·본관 5층과 이어져요.',
    depts: '디자인학부, 아동학과, 모델학과, 화학생명공학과, 토목건축공학과, 뮤지컬학과, 예술대학',
    photo: 'school',
  },
  {
    id: 'eunju2',
    name: '은주2관',
    x: 76,
    y: 82,
    desc: '기숙사(생활관 5동). 풋살장 옆 남·여 출입구가 따로 있어요.',
    depts: '도시공학과, 나노융합',
    photo: 'school',
  },
  {
    id: 'suin',
    name: '수인관',
    x: 61,
    y: 64,
    desc: '체육관·강당. 실내체육과 교내 행사가 열려요.',
    photo: 'smap',
  },
  // 학교 캠퍼스맵 데이터에 없는 건물 — 위치 추정, 내부 미촬영
  {
    id: 'creative',
    name: '크리에이티브센터',
    x: 14,
    y: 56,
    desc: '유담관 옆. 제2주차장(유담관 2층) 쪽문으로 드나들어요. 출입에 카드키가 필요해요.',
  },
];

const n = (
  id: string,
  title: string,
  building: BuildingId,
  x: number,
  y: number,
  floor?: string,
  extra: Partial<PanoNode> = {}
): PanoNode => ({ id, title, building, x, y, floor, ...extra });

const BASE_NODES: PanoNode[] = [
  // ── 정문·도로
  n('gate_front', '정문 앞', 'outdoor', 52, 93),
  n('road_daeilhs_4way', '대일외고·서경대 4갈래', 'outdoor', 58, 89),
  n('daeilhs_gate', '대일외고 정문', 'outdoor', 66, 95),
  n('daeilhs_gate_in', '대일외고 정문 입구', 'outdoor', 70, 97),
  n('road_yudam_front', '유담관 앞', 'outdoor', 43, 76),
  n('road_yudam_3way', '유담관 3갈래 교차로', 'outdoor', 38, 64),
  n('road_hanlim_3way', '한림관 3갈래 교차로', 'outdoor', 36, 52),
  n('road_bon_2way', '본관 오르막 2갈래', 'outdoor', 35, 41),
  n('road_parking_4way', '주차장·북악관·본관 4갈래', 'outdoor', 31, 33),
  n('parking_entrance', '지하주차장 입구', 'outdoor', 35, 35),
  n('bus_stop', '버스정류장 (2115·1164)', 'outdoor', 13, 26),
  n('hr_road', '한림관 도로', 'outdoor', 40, 46),
  n('hr_5way', '한림·유담 계단도로 5갈래', 'outdoor', 42, 55),
  n('hr_futsal_back', '풋살장 뒤 주차장길', 'outdoor', 47, 63),
  n('futsal', '풋살장', 'outdoor', 55, 77),
  // 한림·유담 5갈래와 풋살장 사이 (위치 추정)
  n('eunju_suin_5way', '은주·수인관 5갈래', 'outdoor', 52, 62),
  n('futsal_to_daeilhs', '풋살장 → 대일외고 가는 길', 'outdoor', 61, 86),
  n('field', '운동장 (스콘스퀘어)', 'outdoor', 67, 40),
  n('daeil_chungwoon_fork', '대일관·청운관 갈림길', 'outdoor', 72, 33),

  // ── 지하 제1주차장
  n('parking_3way', '지하주차장 3갈래 교차로', 'outdoor', 46, 40, 'B1', { level: 'underground' }),

  // ── 폭풍의언덕 (북악관 7층 ↔ 문예관 ↔ 대일관 ↔ 운동장)
  // 일반 사진이라 edits.json에서 숨김 — 길은 북악관 7층 ↔ 입구1로 바로 이어진다
  n('hill_entrance', '폭풍의언덕 입구', 'outdoor', 29, 13, undefined, { flat: true }),
  n('hill_entrance2', '폭풍의언덕 입구 (안쪽)', 'outdoor', 32, 14),
  n('hill_moonye_3way', '폭풍의언덕 문예관 3갈래', 'outdoor', 36, 16),
  // 일반 사진(1920×1080) — 같은 자리 360(다음 줄)이 있어 edits.json에서 숨김
  n('hill_moonye_stair', '문예관 가는 계단', 'outdoor', 38, 14, undefined, { flat: true }),
  n('hill_moonye_stair2', '문예관 계단 위', 'outdoor', 40, 13),
  n('hill_moonye_bon_4way', '문예관·본관 4갈래', 'outdoor', 41, 24),
  n('hill_sp_3way', 'SP 입구 3갈래', 'outdoor', 48, 26),
  n('hill_daeil_sp_stair', '대일관 SP 계단', 'outdoor', 53, 28),
  n('hill_field_entrance', '운동장 입구', 'outdoor', 56, 36),

  // ── 문예관
  n('moonye_1f_in', '문예관 1층 내부', 'moonye', 41, 18, '1층'),

  // ── 유담관
  n('yudam_9f', '유담관 9층 입구', 'yudam', 18, 31, '9층'),

  // ── 본관
  n('bon_2115_parking', '2115 주차장 입구', 'bonkwan', 22, 30),
  n('bon_1f_front', '본관 1층 입구 앞', 'bonkwan', 31, 31, '1층'),
  n('bon_1f_in', '본관 1층 내부', 'bonkwan', 29, 28, '1층'),
  n('bon_2f_front', '본관 2층 입구 앞', 'bonkwan', 27, 25, '2층', { level: 'underground' }),

  // ── 한림관
  n('hanlim_in', '한림관 입구 내부', 'hanlim', 44, 37, '1층'),

  // ── 은주1관
  n('eunju1_entrance', '은주1관 입구', 'eunju1', 49, 51, '1층'),
  n('eunju1_hill_in', '은주1관 입구 안 (운동장 쪽)', 'eunju1', 52, 40, '6층'),

  // ── 북악관
  n('bukak_1f_main_in', '북악관 정문 입구 안', 'bukak', 24, 20, '1층'),
  n('bukak_1f_left_in', '북악관 좌측 입구 안', 'bukak', 15, 18, '1층'),
  // id에는 1f가 붙어 있지만 실제는 7층 (편집값이 이 id에 연결돼 있어 id 유지)
  n('bukak_1f_elev', '북악관 7층 엘리베이터 앞', 'bukak', 21, 16, '7층'),
  n('bukak_1f_left', '북악관 1층 좌측 복도', 'bukak', 17, 14, '1층'),
  n('bukak_1f_left_stair', '북악관 1층 좌측 계단 앞', 'bukak', 14, 12, '1층'),
  n('bukak_1f_right', '북악관 1층 우측 복도', 'bukak', 25, 17, '1층'),
  n('bukak_store_back', '북악관 편의점 후문', 'bukak', 28, 19, '1층'),
  n('bukak_b1_elev', '북악관 지하1층 엘리베이터 앞', 'bukak', 21, 17, 'B1', {
    level: 'underground',
  }),
  n('bukak_b1_cafeteria', '북악관 지하1층 GS25 편의점', 'bukak', 18, 18, 'B1', {
    level: 'underground',
  }),
  ...(['2', '3', '5', '6'] as const).flatMap((f) => [
    n(`bukak_${f}f_elev`, `북악관 ${f}층 엘리베이터 앞`, 'bukak', 21, 16, `${f}층`),
    n(`bukak_${f}f_left`, `북악관 ${f}층 좌측 복도`, 'bukak', 17, 14, `${f}층`),
    n(`bukak_${f}f_left_stair`, `북악관 ${f}층 좌측 계단`, 'bukak', 14, 12, `${f}층`),
    n(`bukak_${f}f_right`, `북악관 ${f}층 우측 복도`, 'bukak', 25, 17, `${f}층`),
  ]),
  n('bukak_2f_right_stair', '북악관 2층 우측 계단 앞', 'bukak', 28, 19, '2층'),
  n('bukak_3f_right_stair', '북악관 3층 우측 계단 앞', 'bukak', 28, 19, '3층'),
  n('bukak_5f_right_stair', '북악관 5층 우측 계단 앞', 'bukak', 28, 19, '5층'),
  n('bukak_7f_left', '북악관 7층 좌측 복도', 'bukak', 17, 14, '7층'),
  n('bukak_7f_right', '북악관 7층 우측 복도', 'bukak', 25, 17, '7층'),
  n('bukak_7f_right_stair', '북악관 7층 우측 계단 (폭풍의언덕 방향)', 'bukak', 28, 15, '7층'),
  n('bukak_8f_elev', '북악관 8층 엘리베이터 앞', 'bukak', 21, 16, '8층'),
  n('bukak_9f_stair', '북악관 9층 계단 쪽', 'bukak', 18, 13, '9층'),

  // ── 대일관
  n('daeil_front', '대일관 입구 앞', 'daeil', 56, 30, '1층'),
  n('daeil_1f_in', '대일관 1층 내부', 'daeil', 58, 26, '1층'),
  n('daeil_1f_left', '대일관 1층 좌측길', 'daeil', 53, 23, '1층'),
  n('daeil_1f_left_end', '대일관 1층 좌측길 끝', 'daeil', 49, 21, '1층'),
  n('daeil_b1_left', '대일관 지하1층 좌측길', 'daeil', 50, 25, 'B1', { level: 'underground' }),
  n('daeil_b1_left_end', '대일관 지하1층 좌측길 끝', 'daeil', 48, 31, 'B1', {
    level: 'underground',
  }),
  n('daeil_1f_right', '대일관 1층 우측길', 'daeil', 62, 25, '1층'),
  n('daeil_1f_fork', '대일관 1층 우측 갈림길', 'daeil', 65, 27, '1층'),
  n('daeil_1f_fork2', '대일관 1층 우측 갈림길 (안쪽)', 'daeil', 66, 24, '1층'),
  n('daeil_1f_fork_out', '대일관 1층 갈림길 바깥', 'daeil', 66, 31, '1층'),
  n('daeil_1f_right_end', '대일관 1층 우측길 끝', 'daeil', 68, 23, '1층'),
  n('daeil_1f_right_door', '대일관 1층 우측 맨끝 문', 'daeil', 70, 25, '1층'),
  n('daeil_deck', '대일관 야외데크', 'daeil', 63, 34),
  n('daeil_2f_elev', '대일관 2층 엘리베이터 앞', 'daeil', 58, 24, '2층'),
  n('daeil_2f_left', '대일관 2층 좌측 복도', 'daeil', 53, 22, '2층'),
  n('daeil_2f_right', '대일관 2층 우측 복도', 'daeil', 63, 24, '2층'),
  n('daeil_2f_right_stair', '대일관 2층 우측 계단', 'daeil', 67, 23, '2층'),
  n('daeil_3f_elev', '대일관 3층 엘리베이터 앞', 'daeil', 58, 24, '3층'),
  n('daeil_3f_left', '대일관 3층 좌측 복도', 'daeil', 53, 22, '3층'),
  n('daeil_3f_right', '대일관 3층 우측 복도', 'daeil', 63, 24, '3층'),
  n('daeil_3f_right_stair', '대일관 3층 우측 계단', 'daeil', 67, 23, '3층'),
  n('daeil_5f_elev', '대일관 5층 엘리베이터 앞', 'daeil', 58, 24, '5층'),
  n('daeil_5f_stair', '대일관 5층 계단', 'daeil', 67, 23, '5층'),
  n('daeil_6f_elev', '대일관 6층 엘리베이터 앞', 'daeil', 58, 24, '6층'),
  n('daeil_6f_elev_lit', '대일관 6층 엘리베이터 앞 (점등)', 'daeil', 59, 25, '6층'),
  n('daeil_6f_left', '대일관 6층 좌측길', 'daeil', 53, 22, '6층'),
  // 일반 사진(1920×1080) — 같은 자리 360(다음 줄)이 있어 edits.json에서 숨김
  n('daeil_6f_right', '대일관 6층 우측길', 'daeil', 62, 24, '6층', { flat: true }),
  n('daeil_6f_right2', '대일관 6층 우측길 안쪽', 'daeil', 65, 24, '6층'),
  n('daeil_6f_stair', '대일관 6층 계단', 'daeil', 67, 23, '6층'),
  n('daeil_7f_elev', '대일관 7층 엘리베이터 앞', 'daeil', 58, 24, '7층'),
  n('daeil_7f_left', '대일관 7층 좌측길', 'daeil', 53, 22, '7층'),
  n('daeil_7f_right_stair', '대일관 7층 우측 계단 앞', 'daeil', 67, 23, '7층'),
  n('daeil_7f_studio', '대일관 7층 연습실', 'daeil', 63, 22, '7층'),
  n('daeil_7f_studio2', '대일관 7층 연습실 (2)', 'daeil', 65, 21, '7층'),
  n('daeil_7f_studio_left', '대일관 7층 연습실 좌측', 'daeil', 66, 19, '7층'),
  n('daeil_7f_studio_end', '대일관 7층 연습실 맨끝', 'daeil', 69, 20, '7층'),

  // ── 상승관·청운관·혜인관
  n('rotc', '상승관 · 제206학생군사교육단', 'sangseung', 72, 26),
  n('chungwoon_up_front', '청운관 계단 위 입구 앞', 'chungwoon', 79, 34),
  n('chungwoon_up_in', '청운관 계단 위 입구 안', 'chungwoon', 81, 31),
  n('chungwoon_down_front', '청운관 계단 밑 입구', 'chungwoon', 84, 38, undefined, {
    level: 'underground',
  }),
  n('chungwoon_down_in', '청운관 계단 밑 입구 안', 'chungwoon', 82, 35, undefined, {
    level: 'underground',
  }),
  n('hyein_up_front', '혜인관 계단 위 입구 앞', 'hyein', 79, 46),
  n('hyein_down_in', '혜인관 계단 밑 입구 안', 'hyein', 82, 52, 'B1', { level: 'underground' }),

  // ── 풋살장 주변·은주2관·수인관
  n('eunju2_women', '은주2관 여자기숙사 입구', 'eunju2', 72, 80),
  n('eunju2_men', '은주2관 남자기숙사 입구', 'eunju2', 78, 85),
  n('suin_hall_in', '수인관 체육관·강당 입구', 'suin', 61, 66),
];

const chain = (ids: string[], via: Via): Edge[] =>
  ids.slice(1).map((b, i) => ({ a: ids[i], b, via }));

const BASE_EDGES: Edge[] = [
  // 정문 → 유담관 → 본관 방향 도로
  ...chain(
    [
      'gate_front',
      'road_daeilhs_4way',
      'road_yudam_front',
      'road_yudam_3way',
      'road_hanlim_3way',
      'road_bon_2way',
      'road_parking_4way',
    ],
    'walk'
  ),
  ...chain(['road_daeilhs_4way', 'daeilhs_gate', 'daeilhs_gate_in'], 'walk'),
  { a: 'road_daeilhs_4way', b: 'futsal_to_daeilhs', via: 'walk' },
  { a: 'road_parking_4way', b: 'parking_entrance', via: 'walk' },
  { a: 'road_parking_4way', b: 'bon_2115_parking', via: 'walk' },
  { a: 'bon_2115_parking', b: 'bus_stop', via: 'walk' },
  { a: 'bus_stop', b: 'yudam_9f', via: 'door', note: '버스정류장 바로 옆이 유담관 9층 입구예요.' },
  { a: 'road_bon_2way', b: 'bon_1f_front', via: 'walk' },
  { a: 'bon_1f_front', b: 'bon_1f_in', via: 'door' },
  { a: 'road_parking_4way', b: 'bukak_1f_main_in', via: 'door' },
  { a: 'bus_stop', b: 'bukak_1f_left_in', via: 'door' },

  // 한림관 도로
  { a: 'road_hanlim_3way', b: 'hr_road', via: 'walk' },
  { a: 'hr_road', b: 'hanlim_in', via: 'door' },
  { a: 'hr_road', b: 'hr_5way', via: 'walk' },
  {
    a: 'hr_5way',
    b: 'road_yudam_3way',
    via: 'stairs',
    note: '한림·유담 사이 계단도로를 이용해요.',
  },
  { a: 'hr_5way', b: 'eunju1_entrance', via: 'walk' },
  { a: 'hr_5way', b: 'hr_futsal_back', via: 'walk' },
  { a: 'hr_futsal_back', b: 'futsal', via: 'walk' },
  { a: 'hr_5way', b: 'eunju_suin_5way', via: 'walk' },
  { a: 'eunju_suin_5way', b: 'futsal', via: 'walk' },
  {
    a: 'hanlim_in',
    b: 'eunju1_entrance',
    via: 'passage',
    note: '한림관 원형 연결통로로 은주1관과 이어져요.',
  },

  // 풋살장 주변
  { a: 'futsal', b: 'futsal_to_daeilhs', via: 'walk' },
  { a: 'futsal', b: 'eunju2_women', via: 'walk' },
  { a: 'futsal', b: 'eunju2_men', via: 'walk' },
  { a: 'futsal', b: 'suin_hall_in', via: 'door' },

  // 은주1관 1층 ↔ 6층(운동장 쪽 출입구)
  {
    a: 'eunju1_entrance',
    b: 'eunju1_hill_in',
    via: 'elevator',
    note: '은주1관 6층은 스콘스퀘어(운동장)와 같은 높이예요.',
  },
  { a: 'eunju1_hill_in', b: 'hill_field_entrance', via: 'door' },
  { a: 'hill_field_entrance', b: 'field', via: 'walk' },

  // 폭풍의언덕 — 북악관 7층 → 문예관 숨은 길
  {
    a: 'bukak_7f_right_stair',
    b: 'hill_entrance',
    via: 'door',
    note: '북악관 7층 우측 계단 쪽 출입구로 나가면 폭풍의언덕이에요.',
  },
  ...chain(['hill_entrance', 'hill_entrance2', 'hill_moonye_3way'], 'walk'),
  ...chain(['hill_moonye_3way', 'hill_moonye_stair', 'hill_moonye_stair2'], 'stairs'),
  { a: 'hill_moonye_stair2', b: 'moonye_1f_in', via: 'door' },
  ...chain(['hill_moonye_3way', 'hill_moonye_bon_4way', 'hill_sp_3way'], 'walk'),
  { a: 'hill_sp_3way', b: 'hill_daeil_sp_stair', via: 'stairs' },
  { a: 'hill_daeil_sp_stair', b: 'daeil_front', via: 'walk' },
  { a: 'hill_sp_3way', b: 'hill_field_entrance', via: 'walk' },

  // 지하 제1주차장 허브 (본관·북악관·대일관·청운관·혜인관 연결)
  {
    a: 'parking_entrance',
    b: 'parking_3way',
    via: 'walk',
    note: '차량 진입 가능한 지하 제1주차장이에요.',
  },
  { a: 'parking_3way', b: 'bukak_b1_elev', via: 'passage' },
  { a: 'parking_3way', b: 'daeil_b1_left_end', via: 'passage' },
  { a: 'parking_3way', b: 'chungwoon_down_front', via: 'passage' },
  { a: 'parking_3way', b: 'hyein_down_in', via: 'passage' },
  {
    a: 'bon_2f_front',
    b: 'bukak_b1_elev',
    via: 'passage',
    note: '본관 2층과 북악관 지하1층은 지하통로로 이어져요.',
  },
  { a: 'bon_1f_in', b: 'bon_2f_front', via: 'stairs' },

  // 북악관 내부
  { a: 'bukak_1f_left_in', b: 'bukak_1f_left', via: 'walk' },
  { a: 'bukak_1f_main_in', b: 'bukak_1f_left', via: 'walk' },
  { a: 'bukak_1f_left', b: 'bukak_1f_left_stair', via: 'walk' },
  { a: 'bukak_1f_main_in', b: 'bukak_1f_right', via: 'walk' },
  { a: 'bukak_1f_right', b: 'bukak_store_back', via: 'walk' },
  { a: 'bukak_b1_elev', b: 'bukak_b1_cafeteria', via: 'walk' },
  ...['2', '3', '5', '6'].flatMap((f) => [
    { a: `bukak_${f}f_elev`, b: `bukak_${f}f_left`, via: 'walk' as Via },
    { a: `bukak_${f}f_left`, b: `bukak_${f}f_left_stair`, via: 'walk' as Via },
    { a: `bukak_${f}f_elev`, b: `bukak_${f}f_right`, via: 'walk' as Via },
  ]),
  ...['2', '3', '5'].map((f) => ({
    a: `bukak_${f}f_right`,
    b: `bukak_${f}f_right_stair`,
    via: 'walk' as Via,
  })),
  { a: 'bukak_1f_elev', b: 'bukak_7f_left', via: 'walk' },
  { a: 'bukak_1f_elev', b: 'bukak_7f_right', via: 'walk' },
  { a: 'bukak_7f_right', b: 'bukak_7f_right_stair', via: 'walk' },
  ...chain(
    [
      'bukak_b1_elev',
      'bukak_1f_main_in',
      'bukak_2f_elev',
      'bukak_3f_elev',
      'bukak_5f_elev',
      'bukak_6f_elev',
      'bukak_1f_elev',
      'bukak_8f_elev',
    ],
    'elevator'
  ),
  { a: 'bukak_8f_elev', b: 'bukak_9f_stair', via: 'stairs' },
  ...chain(
    [
      'bukak_1f_left_stair',
      'bukak_2f_left_stair',
      'bukak_3f_left_stair',
      'bukak_5f_left_stair',
      'bukak_6f_left_stair',
    ],
    'stairs'
  ),
  ...chain(
    [
      'bukak_2f_right_stair',
      'bukak_3f_right_stair',
      'bukak_5f_right_stair',
      'bukak_7f_right_stair',
    ],
    'stairs'
  ),

  // 대일관 내부
  { a: 'daeil_front', b: 'daeil_1f_in', via: 'door' },
  ...chain(['daeil_1f_in', 'daeil_1f_left', 'daeil_1f_left_end'], 'walk'),
  { a: 'daeil_1f_left_end', b: 'daeil_b1_left', via: 'stairs' },
  { a: 'daeil_b1_left', b: 'daeil_b1_left_end', via: 'walk' },
  ...chain(
    ['daeil_1f_in', 'daeil_1f_right', 'daeil_1f_fork', 'daeil_1f_right_end', 'daeil_1f_right_door'],
    'walk'
  ),
  { a: 'daeil_1f_fork', b: 'daeil_1f_fork2', via: 'walk' },
  { a: 'daeil_1f_fork', b: 'daeil_1f_fork_out', via: 'door' },
  { a: 'daeil_1f_fork_out', b: 'daeil_deck', via: 'walk' },
  { a: 'daeil_deck', b: 'field', via: 'walk' },
  { a: 'daeil_1f_right_door', b: 'daeil_chungwoon_fork', via: 'door' },
  ...chain(
    [
      'daeil_1f_in',
      'daeil_2f_elev',
      'daeil_3f_elev',
      'daeil_5f_elev',
      'daeil_6f_elev',
      'daeil_7f_elev',
    ],
    'elevator'
  ),
  ...chain(
    [
      'daeil_2f_right_stair',
      'daeil_3f_right_stair',
      'daeil_5f_stair',
      'daeil_6f_stair',
      'daeil_7f_right_stair',
    ],
    'stairs'
  ),
  { a: 'daeil_2f_elev', b: 'daeil_2f_left', via: 'walk' },
  ...chain(['daeil_2f_elev', 'daeil_2f_right', 'daeil_2f_right_stair'], 'walk'),
  { a: 'daeil_3f_elev', b: 'daeil_3f_left', via: 'walk' },
  ...chain(['daeil_3f_elev', 'daeil_3f_right', 'daeil_3f_right_stair'], 'walk'),
  { a: 'daeil_5f_elev', b: 'daeil_5f_stair', via: 'walk' },
  { a: 'daeil_6f_elev', b: 'daeil_6f_elev_lit', via: 'walk' },
  { a: 'daeil_6f_elev', b: 'daeil_6f_left', via: 'walk' },
  ...chain(['daeil_6f_elev', 'daeil_6f_right', 'daeil_6f_right2', 'daeil_6f_stair'], 'walk'),
  { a: 'daeil_7f_elev', b: 'daeil_7f_left', via: 'walk' },
  ...chain(
    [
      'daeil_7f_elev',
      'daeil_7f_right_stair',
      'daeil_7f_studio',
      'daeil_7f_studio2',
      'daeil_7f_studio_end',
    ],
    'walk'
  ),
  { a: 'daeil_7f_studio2', b: 'daeil_7f_studio_left', via: 'walk' },

  // 상승관·청운관·혜인관
  { a: 'daeil_chungwoon_fork', b: 'rotc', via: 'walk' },
  { a: 'daeil_chungwoon_fork', b: 'chungwoon_up_front', via: 'walk' },
  { a: 'chungwoon_up_front', b: 'chungwoon_up_in', via: 'door' },
  { a: 'chungwoon_down_front', b: 'chungwoon_down_in', via: 'door' },
  { a: 'chungwoon_up_in', b: 'chungwoon_down_in', via: 'stairs' },
  { a: 'field', b: 'hyein_up_front', via: 'walk' },
  { a: 'hyein_up_front', b: 'hyein_down_in', via: 'stairs' },
];

// 층별 촬영분 (건물 내부 층마다 1~5장)
const FLOOR = buildFloorGraph(loadFloorPanos(), new Map(BUILDINGS.map((b) => [b.id, b])));
// 편집기(?tag=1)에서 고친 설명·연결 (edits.json + 공유 수정값)
const EDITS = loadAllEdits();
// 기존 지점에도 편집기에서 고친 건물·층을 반영한다 (층별 촬영분은 buildFloorGraph에서 이미 반영)
const FLOOR_EDITS = loadFloorEdits();
const BASE_FIXED = BASE_NODES.map((n) => {
  const e = FLOOR_EDITS[n.id];
  if (!e) return n;
  return {
    ...n,
    ...(e.b ? { building: e.b } : {}),
    ...(e.f !== undefined ? { floor: e.f ?? undefined } : {}),
  };
});
export const NODES: PanoNode[] = applyNodeEdits([...BASE_FIXED, ...FLOOR.nodes], EDITS);
export const EDGES: Edge[] = applyLinks([...BASE_EDGES, ...FLOOR.edges], EDITS);

// ── 검색 대상 장소
export type PlaceKind = 'building' | 'facility' | 'office' | 'professor' | 'room';

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  node: string;
  sub?: string;
  aliases?: string[];
  /** 실제 위치가 확인되지 않은 예시 데이터 */
  sample?: boolean;
  /** 현장에서 찍은 문 앞 사진 (public/door/) */
  photo?: string;
  /** 호실 장소만: 건물·층·호수, 도착 사진을 정한 근거 (floor 그 층 대표 · building 건물 입구 · editor 편집기에서 지정) */
  building?: BuildingId;
  floor?: string;
  room?: string;
  basis?: 'floor' | 'building' | 'editor';
  /** 편집기 지정 전 원래 값 (되돌리기용) */
  base?: { node: string; basis?: Place['basis']; sub?: string };
}

const BASE_PLACES: Place[] = [
  {
    id: 'b-yudam',
    name: '유담관',
    kind: 'building',
    node: 'yudam_9f',
    sub: '9층 버스정류장 쪽 입구',
    aliases: ['유담', '은행', '우체국', '스포렉스'],
  },
  { id: 'b-bukak', name: '북악관', kind: 'building', node: 'bukak_1f_main_in', aliases: ['북악'] },
  {
    id: 'b-bonkwan',
    name: '본관',
    kind: 'building',
    node: 'bon_1f_front',
    sub: '행정부서',
    aliases: ['행정관', '본부'],
  },
  { id: 'b-moonye', name: '문예관', kind: 'building', node: 'moonye_1f_in', aliases: ['문예'] },
  {
    id: 'b-hanlim',
    name: '한림관',
    kind: 'building',
    node: 'hanlim_in',
    aliases: ['한림', '원형건물'],
  },
  { id: 'b-daeil', name: '대일관', kind: 'building', node: 'daeil_front', aliases: ['대일'] },
  {
    id: 'b-sangseung',
    name: '상승관',
    kind: 'building',
    node: 'rotc',
    sub: '제206학생군사교육단',
    aliases: ['ROTC', '학군단', '206', '상승'],
  },
  {
    id: 'b-chungwoon',
    name: '청운관',
    kind: 'building',
    node: 'chungwoon_up_front',
    aliases: ['청운'],
  },
  { id: 'b-hyein', name: '혜인관', kind: 'building', node: 'hyein_up_front', aliases: ['혜인'] },
  {
    id: 'b-eunju1',
    name: '은주1관',
    kind: 'building',
    node: 'eunju1_entrance',
    aliases: ['은주일관', '은주 1관'],
  },
  {
    id: 'b-eunju2',
    name: '은주2관',
    kind: 'building',
    node: 'eunju2_women',
    sub: '기숙사 (생활관 5동)',
    aliases: ['은주이관', '은주 2관', '기숙사', '생활관'],
  },
  {
    id: 'b-creative',
    name: '크리에이티브센터',
    kind: 'building',
    node: 's1013_110730',
    sub: '유담관 옆 도로 · 제2주차장 쪽문도 있어요',
    aliases: ['크리에이티브', '크리센', '크센', '창의센터'],
  },
  {
    id: 'b-suin',
    name: '수인관',
    kind: 'building',
    node: 'suin_hall_in',
    sub: '체육관·강당',
    aliases: ['체육관', '강당', '수인'],
  },

  {
    id: 'f-bus',
    name: '버스정류장',
    kind: 'facility',
    node: 'bus_stop',
    sub: '2115 · 1164번',
    aliases: ['버정', '정류장', '2115', '1164', '버스'],
  },
  {
    id: 'f-gate',
    name: '정문',
    kind: 'facility',
    node: 'gate_front',
    aliases: ['학교 입구', '정문앞'],
  },
  {
    id: 'f-field',
    name: '운동장 (스콘스퀘어)',
    kind: 'facility',
    node: 'field',
    aliases: ['운동장', '스콘스퀘어', '스콘'],
  },
  { id: 'f-futsal', name: '풋살장', kind: 'facility', node: 'futsal', aliases: ['풋살파크'] },
  // 현장 기준 — 북악관 지하1층은 GS25만, 식당은 청운관 1층(학교 데이터로는 지하1층)
  {
    id: 'f-cafeteria',
    name: '식당 (수유리우동 · 노브랜드버거)',
    kind: 'facility',
    node: 's1012_112522',
    sub: '청운관 1층 (계단 밑 입구)',
    aliases: ['학식', '식당', '밥', '우동', '버거', '수유리우동', '노브랜드버거'],
  },
  // GS25·emart24는 utils/rooms.ts FIELD_FLOORS에서 장소로 만들어진다
  {
    id: 'f-parking1',
    name: '제1주차장 (지하)',
    kind: 'facility',
    node: 'parking_3way',
    sub: '본관·북악관·대일관·청운관·혜인관 연결',
    aliases: ['주차장', '지하주차장', '주차'],
  },
  {
    id: 'f-2115parking',
    name: '2115 주차장',
    kind: 'facility',
    node: 'bon_2115_parking',
    aliases: [],
  },
  {
    id: 'f-hill',
    name: '폭풍의언덕',
    kind: 'facility',
    node: 'hill_entrance2',
    sub: '북악관 7층 ↔ 문예관 숨은 길',
    aliases: ['언덕'],
  },
  {
    id: 'f-deck',
    name: '대일관 야외데크',
    kind: 'facility',
    node: 'daeil_deck',
    aliases: ['데크', '야외데크'],
  },
  {
    id: 'f-studio',
    name: '대일관 7층 연습실',
    kind: 'facility',
    node: 'daeil_7f_studio',
    aliases: ['연습실'],
  },
  {
    id: 'f-dorm-w',
    name: '여자기숙사 입구',
    kind: 'facility',
    node: 'eunju2_women',
    sub: '은주2관',
    aliases: ['여기숙사'],
  },
  {
    id: 'f-dorm-m',
    name: '남자기숙사 입구',
    kind: 'facility',
    node: 'eunju2_men',
    sub: '은주2관',
    aliases: ['남기숙사'],
  },
  {
    id: 'f-daeilhs',
    name: '대일외고 정문',
    kind: 'facility',
    node: 'daeilhs_gate',
    aliases: ['대일외고'],
  },
];

export const NODE_BY_ID = new Map(NODES.map((x) => [x.id, x]));
export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));

// 건물 + 학교 캠퍼스맵 호실(교수연구실·부서·강의실)
const BUILDING_NODE = new Map(
  BASE_PLACES.filter((p) => p.kind === 'building').map((p) => [
    p.id.replace('b-', '') as BuildingId,
    p.node,
  ])
);
// 층별 촬영분이 있는 곳은 그 층 대표 지점으로 (분류를 고쳐도 따라감)
const floorRep = (b: BuildingId, f: string) =>
  NODES.find((x) => x.building === b && x.floor === f && x.center)?.id;
// (식당은 청운관 CSV의 '1층 식당앞' 사진으로 바로 가리킨다)
const AT_FLOOR: Record<string, [BuildingId, string]> = {};
for (const p of BASE_PLACES) if (AT_FLOOR[p.id]) p.node = floorRep(...AT_FLOOR[p.id]) ?? p.node;
export const PLACES: Place[] = [...BASE_PLACES, ...buildRoomPlaces(BUILDING_NODE)];
// 편집기에서 장소별 도착 사진을 지정한 값
for (const p of PLACES)
  if (EDITS.placeNode[p.id])
    Object.assign(p, {
      base: { node: p.node, basis: p.basis, sub: p.sub },
      node: EDITS.placeNode[p.id],
      basis: 'editor',
      sub: p.sub?.replace(' · 건물 입구까지 안내', ''),
    });

// 사진(360·썸네일·건물·문 앞)은 Supabase Storage 공개 버킷(VITE_IMG_BASE)에서 읽는다.
// 값이 없으면 public/에서 읽는다. 업로드: scripts/upload-images-supabase.mjs
// node 스크립트에서 불러올 땐 import.meta.env가 없다
const ENV = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
export const IMG_BASE = ENV.VITE_IMG_BASE?.replace(/\/?$/, '/') ?? ENV.BASE_URL ?? '/';
export const panoUrl = (id: string) => `${IMG_BASE}pano/${id}.jpg`;
export const thumbUrl = (id: string) => `${IMG_BASE}thumb/${id}.jpg`;
export const buildingPhotoUrl = (id: BuildingId) => `${IMG_BASE}building/${id}.jpg`;
