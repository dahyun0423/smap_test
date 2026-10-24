// 경로 요약 — 예상 거리·소요 시간 (지도 좌표로 어림한 값)
import { NODE_BY_ID } from '@/data/campus';
import { edgeBetween } from '@/utils/graph';

// 미니맵 1% ≈ 3.37m (utils/location.ts의 위경도 변환식에서 계산)
const METERS_PER_PCT = 3.37;
// 언덕이 많은 캠퍼스라 조금 느린 걸음 (m/s)
const WALK_SPEED = 1.1;
// 실내 같은 층 사진은 좌표가 겹쳐 있어 한 구간을 최소 이만큼 걷는다고 본다 (m)
const MIN_STEP_M = 12;
const ELEVATOR_SEC = 60;
const STAIRS_SEC = 25;

export interface RouteStats {
  meters: number;
  minutes: number;
  elevators: number;
  stairs: number;
}

export function routeStats(path: string[]): RouteStats {
  let meters = 0;
  let extraSec = 0;
  let elevators = 0;
  let stairs = 0;
  for (let i = 1; i < path.length; i++) {
    const a = NODE_BY_ID.get(path[i - 1])!;
    const b = NODE_BY_ID.get(path[i])!;
    const via = edgeBetween(a.id, b.id)?.via;
    // 연결이 없는데 층이 바뀌면 여러 층을 한 번에 탄 엘리베이터 구간
    if (via === 'elevator' || (!via && a.floor !== b.floor)) {
      elevators++;
      extraSec += ELEVATOR_SEC;
      continue;
    }
    if (via === 'stairs') {
      stairs++;
      extraSec += STAIRS_SEC;
      continue;
    }
    meters += Math.max(Math.hypot(b.x - a.x, b.y - a.y) * METERS_PER_PCT, MIN_STEP_M);
  }
  const minutes = Math.max(1, Math.round((meters / WALK_SPEED + extraSec) / 60));
  return { meters: Math.round(meters / 10) * 10, minutes, elevators, stairs };
}
