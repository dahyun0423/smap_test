import type { Place } from '@/data/campus';

/** 출발지·도착지로 쓰는 지점 */
export interface Spot {
  node: string;
  label: string;
  place?: Place;
}

/** 진행 중인 길안내 */
export interface ActiveRoute {
  from: Spot;
  to: Spot;
  /** 지나갈 360 지점 id (출발 → 도착) */
  path: string[];
}
