// 현재 위치(GPS) → 가장 가까운 360 지점.
// 지점 좌표는 미니맵 위 %라서, 건물 12곳의 위경도로 맞춘 1차 변환식으로 옮긴다.
// 오차는 대부분 2~3%, 캠퍼스 남쪽은 10% 이상. 실내에서는 NFC·검색이 더 정확하다.
import { type Level, NODES, NODE_BY_ID } from '@/data/campus';
import type { Spot } from '@/types';

// 변환 기준점
const LAT0 = 37.615065;
const LNG0 = 127.012854;
// x% = a·Δlat + b·Δlng + c  (Δ = (값 - 기준) × 10⁴)
const CX = [-0.83625, 2.61617, 53.4167];
const CY = [-3.30849, -0.45333, 38.5];
const CAMPUS_RADIUS_M = 350;

/** 위경도 → 미니맵 좌표(%) */
export function gpsToMap(lat: number, lng: number) {
  const a = (lat - LAT0) * 1e4;
  const b = (lng - LNG0) * 1e4;
  return { x: CX[0] * a + CX[1] * b + CX[2], y: CY[0] * a + CY[1] * b + CY[2] };
}

/** 미니맵 위치(%)에서 가장 가까운 360 지점 (같은 층 지도 기준) */
export function nearestNode(x: number, y: number, level: Level = 'ground'): string | null {
  let best: string | null = null;
  let bd = Infinity;
  for (const n of NODES) {
    if ((n.level ?? 'ground') !== level || n.flat || n.hidden) continue;
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = n.id;
    }
  }
  return best;
}

/** 기준점에서의 거리(m) — 캠퍼스 안인지 판단용 */
const meters = (lat: number, lng: number) => {
  const dy = (lat - LAT0) * 111_320;
  const dx = (lng - LNG0) * 111_320 * Math.cos((LAT0 * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

export type LocateResult =
  | { spot: Spot; accuracy: number }
  | { error: 'unsupported' | 'denied' | 'unavailable' | 'outside' };

/** 현재 위치 → 가장 가까운 지점. 캠퍼스 밖이거나 권한이 없으면 error */
export function locate(): Promise<LocateResult> {
  return new Promise((done) => {
    if (!navigator.geolocation) return done({ error: 'unsupported' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (meters(coords.latitude, coords.longitude) > CAMPUS_RADIUS_M)
          return done({ error: 'outside' });
        const { x, y } = gpsToMap(coords.latitude, coords.longitude);
        const node = nearestNode(x, y);
        if (!node) return done({ error: 'unavailable' });
        done({
          spot: { node, label: `현재 위치 · ${NODE_BY_ID.get(node)!.title}` },
          accuracy: Math.round(coords.accuracy),
        });
      },
      (e) => done({ error: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  });
}

export const LOCATE_ERROR: Record<Exclude<LocateResult, { spot: Spot }>['error'], string> = {
  unsupported: '이 브라우저는 위치를 쓸 수 없어요. 검색이나 지도에서 골라주세요.',
  denied: '위치 권한이 꺼져 있어요. 브라우저 설정에서 위치를 허용하거나, 검색·지도에서 골라주세요.',
  unavailable: '위치를 찾지 못했어요. 실내라면 검색이나 지도에서 골라주세요.',
  outside:
    '지금 학교 밖이에요. 학교에 오면 쓸 수 있어요 — 정문에서 출발하려면 아래에서 ‘정문’을 고르세요.',
};
