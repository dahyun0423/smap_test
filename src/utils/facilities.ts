// 편의시설 필터 (홈 캠퍼스 지도). 현장에서 확인한 시설 목록을 지점별로 묶어 지도 핀으로 띄운다.
// 아이콘은 components/common/MapIcons의 FAC_ICON
import { NODE_BY_ID, PLACES, type Place } from '@/data/campus';

export const FAC_CATS = [
  { id: 'store', label: '매점·편의점' },
  { id: 'food', label: '식당' },
  { id: 'cafe', label: '카페' },
  { id: 'atm', label: 'ATM·은행' },
  { id: 'post', label: '우체국' },
  { id: 'print', label: '복사·서점' },
] as const;
export type FacCat = (typeof FAC_CATS)[number]['id'];

interface Facility {
  cat: FacCat;
  /** 핀·목록에 보일 이름 */
  name: string;
  /** 검색 장소 이름 (PLACES의 name, 있으면 그 장소의 호실 정보를 쓴다) */
  place?: string;
  /** 길안내 도착 지점 (없으면 검색 장소의 도착 지점) */
  node?: string;
  /** 지도 핀 위치 (도착 지점이 지하 지도에 있을 때 지상 지도에 띄우려고) */
  pin?: string;
  /** 검색 장소가 없을 때 보조 설명 */
  sub?: string;
}

// 현장 확인 목록 — 시설이 바뀌면 여기만 고친다
const FACILITIES: Facility[] = [
  {
    cat: 'store',
    name: 'GS25 편의점',
    place: 'GS25 편의점',
    node: 'bukak_b1_cafeteria',
    pin: 'bukak_store_back',
  },
  { cat: 'store', name: '이마트24 편의점', place: 'emart24 편의점' },
  { cat: 'store', name: '매점', place: '매점 (905호)' },
  { cat: 'food', name: '교직원·학생식당', place: '교직원 및 학생식당 (201호)' },
  { cat: 'food', name: '수유리우동', place: '수유리우동 (식당)' },
  { cat: 'food', name: '노브랜드버거', place: '노브랜드버거 (식당)' },
  { cat: 'cafe', name: '로렐카페', place: '로렐 카페 (907호)' },
  { cat: 'cafe', name: 'SP카페', place: '카페SP (B201호)' },
  { cat: 'cafe', name: 'MD카페', place: 'MD카페 (522호)' },
  { cat: 'atm', name: '신한은행', place: '신한은행 (304호)' },
  // 북악관 L층 사진이 아직 없어 1층 중앙으로 안내
  { cat: 'atm', name: '신한은행 ATM', node: 'bukak_1f_main_in', sub: '북악관 L층' },
  { cat: 'post', name: '우체국', place: '우체국 (306호)' },
  { cat: 'print', name: '프린트기', node: 'bukak_1f_main_in', sub: '북악관 1층' },
  { cat: 'print', name: '서점', place: '서점 (101호)' },
  { cat: 'print', name: '복사실', place: '복사실 (102호)' },
];

export interface FacSpot {
  /** 지도 핀 위치 */
  node: string;
  places: Place[];
}

const PLACE_BY_NAME = new Map(PLACES.map((p) => [p.name, p]));

/** 시설 → 길안내용 장소 */
function toPlace(f: Facility): Place | null {
  const base = f.place ? PLACE_BY_NAME.get(f.place) : undefined;
  const node = f.node ?? base?.node;
  if (!node || !NODE_BY_ID.has(node)) return null;
  if (base) return { ...base, name: f.name, node };
  return { id: `fac-${f.cat}-${f.name}`, name: f.name, kind: 'facility', node, sub: f.sub };
}

/** 분류에 맞는 시설을 핀 위치별로 묶어 반환 */
export function facilitySpots(cat: FacCat): FacSpot[] {
  const by = new Map<string, Place[]>();
  for (const f of FACILITIES) {
    if (f.cat !== cat) continue;
    const place = toPlace(f);
    if (!place) continue;
    const pin = f.pin && NODE_BY_ID.has(f.pin) ? f.pin : place.node;
    by.set(pin, [...(by.get(pin) ?? []), place]);
  }
  return [...by].map(([node, places]) => ({ node, places }));
}
