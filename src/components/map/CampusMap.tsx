import type { MouseEvent, ReactNode } from 'react';

import { FAC_ICON } from '@/components/common/MapIcons';
import { BUILDINGS, type BuildingId, type Level, NODE_BY_ID } from '@/data/campus';
import { nearestNode } from '@/utils/location';

interface Props {
  level: Level;
  onLevel?: (l: Level) => void;
  route?: string[];
  current?: string;
  /** 도착 지점 */
  target?: string;
  onBuilding?: (id: BuildingId) => void;
  compact?: boolean;
  /** 지도를 탭해 가장 가까운 360 지점 고르기 (제보 위치) */
  onPick?: (node: string) => void;
  /** 편의시설 핀 (있으면 건물 핀 대신) */
  markers?: { node: string; label: string; icon?: ReactNode; onClick: () => void }[];
}

// 캠퍼스 미니맵 (scripts/draw-campus-map.py로 생성, 학교 VR투어 미니맵과 같은 틀). 지점·건물 좌표는 지도 대비 %(0~100)
const MAP = { ground: 'map-ground.svg', underground: 'map-underground.svg' };

export default function CampusMap({
  level,
  onLevel,
  route,
  current,
  target,
  onBuilding,
  compact,
  onPick,
  markers,
}: Props) {
  const pts = route?.map((id) => NODE_BY_ID.get(id)!).filter(Boolean) ?? [];
  const cur = current ? NODE_BY_ID.get(current) : undefined;
  const tgt = target ? NODE_BY_ID.get(target) : undefined;

  // 지도를 탭한 위치에서 가장 가까운 360 지점
  const pick = (e: MouseEvent<HTMLDivElement>) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const best = nearestNode(x, y, level);
    if (best) onPick(best);
  };

  return (
    <div className={`cmap ${compact ? 'cmap-compact' : ''} ${onPick ? 'cmap-picking' : ''}`}>
      <div className="cmap-stage" onClick={pick}>
        <img
          src={`${import.meta.env.BASE_URL}${MAP[level]}`}
          alt={level === 'ground' ? '서경대학교 지상 미니맵' : '서경대학교 지하 미니맵'}
          draggable={false}
        />
        {pts.length > 1 && (
          <svg
            className="cmap-route"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              className="cmap-route-casing"
            />
            <polyline
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              className="cmap-route-line"
            />
          </svg>
        )}
        {markers?.map((m) => {
          const n = NODE_BY_ID.get(m.node)!;
          if ((n.level ?? 'ground') !== level) return null;
          return (
            <button
              key={m.node}
              className="cmap-pin cmap-fac"
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
              onClick={m.onClick}
            >
              {m.icon}
              {m.label}
            </button>
          );
        })}
        {!compact &&
          !onPick &&
          !markers &&
          BUILDINGS.map((b) => (
            <button
              key={b.id}
              className="cmap-pin"
              style={{ left: `${b.x}%`, top: `${b.y}%` }}
              onClick={() => onBuilding?.(b.id)}
            >
              {FAC_ICON.building}
              {b.name}
            </button>
          ))}
        {pts.length > 0 && (
          <span
            className="cmap-dot cmap-dot-start"
            style={{ left: `${pts[0].x}%`, top: `${pts[0].y}%` }}
          />
        )}
        {tgt && (
          <span className="cmap-dot cmap-dot-end" style={{ left: `${tgt.x}%`, top: `${tgt.y}%` }} />
        )}
        {cur && <span className="cmap-me" style={{ left: `${cur.x}%`, top: `${cur.y}%` }} />}
      </div>
      {onLevel && (
        <div className="seg cmap-level" role="tablist" aria-label="지도 층">
          <button role="tab" aria-selected={level === 'ground'} onClick={() => onLevel('ground')}>
            지상
          </button>
          <button
            role="tab"
            aria-selected={level === 'underground'}
            onClick={() => onLevel('underground')}
          >
            지하
          </button>
        </div>
      )}
    </div>
  );
}
