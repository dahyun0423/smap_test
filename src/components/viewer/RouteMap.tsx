import { useLayoutEffect, useRef, useState } from 'react';

import { NODE_BY_ID } from '@/data/campus';

const MAP_W = 1024;
const MAP_H = 684;
const MAP = { ground: 'map-ground.svg', underground: 'map-underground.svg' };
// 화살표 간격 (화면 px)
const ARROW_GAP = 46;
// 가까운 경로를 너무 크게 키우지 않도록
const MAX_ZOOM = 2.5;
// 아래 시트가 지도를 덮는 높이 (styles .route-sheet top)
const SHEET_OVERLAP = 24;

interface Props {
  path: string[];
}

/** 경로 전체를 화면에 맞춰 확대한 지도 — 파란 경로선 + 진행 방향 화살표 + 출발·도착 핀 */
export default function RouteMap({ path }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodes = path.map((id) => NODE_BY_ID.get(id)!);
  const pts = nodes.map((n) => [(n.x / 100) * MAP_W, (n.y / 100) * MAP_H] as const);
  // 경로 지점이 더 많은 층의 지도를 쓴다
  const under = nodes.filter((n) => n.level === 'underground').length;
  const level = under > nodes.length / 2 ? 'underground' : 'ground';

  // 경로 전체가 한눈에 들어오도록 배율·위치 계산 (아래 시트가 덮는 부분과 위쪽 핀 자리는 비운다)
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [padX, padTop, padBottom] = [36, 56, 44];
  const viewH = size.h - SHEET_OVERLAP;
  const fitW = (size.w - padX * 2) / Math.max(x1 - x0, 1);
  const fitH = (viewH - padTop - padBottom) / Math.max(y1 - y0, 1);
  // 크기를 재기 전(0)에는 계산하지 않는다
  const k = size.w > 0 ? Math.max(Math.min(fitW, fitH, MAX_ZOOM), 0.1) : 0;
  const tx = size.w / 2 - ((x0 + x1) / 2) * k;
  const ty = padTop + (viewH - padTop - padBottom) / 2 - ((y0 + y1) / 2) * k;

  // 경로를 따라 일정 간격(화면 기준)으로 화살표 — 진행 방향으로 회전
  const arrows: { x: number; y: number; deg: number }[] = [];
  const gap = k > 0 ? ARROW_GAP / k : Infinity;
  let next = gap / 2;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    while (next <= walked + len) {
      const t = (next - walked) / len;
      arrows.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, deg });
      next += gap;
    }
    walked += len;
  }

  const start = pts[0];
  const end = pts[pts.length - 1];
  const line = pts.map((p) => p.join(',')).join(' ');
  // 선 굵기는 확대해도 화면에서 일정하게
  const sw = 1 / k;

  return (
    <div className="route-map" ref={box}>
      {size.w > 0 && (
        <div
          className="route-map-stage"
          style={{
            width: MAP_W,
            height: MAP_H,
            transform: `translate(${tx}px, ${ty}px) scale(${k})`,
          }}
        >
          <img src={`${import.meta.env.BASE_URL}${MAP[level]}`} alt="" draggable={false} />
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true">
            <polyline points={line} className="route-map-casing" strokeWidth={12 * sw} />
            <polyline points={line} className="route-map-line" strokeWidth={8 * sw} />
            {arrows.map((a, i) => (
              <path
                key={i}
                d="M-2.5,-3 L1.5,0 L-2.5,3"
                className="route-map-arrow"
                strokeWidth={1.6}
                transform={`translate(${a.x} ${a.y}) rotate(${a.deg}) scale(${sw})`}
              />
            ))}
            <circle cx={start[0]} cy={start[1]} r={6 * sw} className="route-map-dot" />
            <circle cx={end[0]} cy={end[1]} r={6 * sw} className="route-map-dot is-end" />
          </svg>
        </div>
      )}
      {size.w > 0 && (
        <>
          <span className="route-pin" style={{ left: tx + start[0] * k, top: ty + start[1] * k }}>
            출발
          </span>
          <span
            className="route-pin is-end"
            style={{ left: tx + end[0] * k, top: ty + end[1] * k }}
          >
            도착
          </span>
        </>
      )}
    </div>
  );
}
