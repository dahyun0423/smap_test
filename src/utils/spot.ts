import type { Place } from '@/data/campus';
import type { Spot } from '@/types';

/** 검색 장소 → 출발·도착 지점 */
export const placeToSpot = (p: Place): Spot => ({ node: p.node, label: p.name, place: p });
