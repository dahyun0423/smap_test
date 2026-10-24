import { IconClose } from '@/components/common/Icons';
import RouteMap from '@/components/viewer/RouteMap';
import { NODE_BY_ID, thumbUrl } from '@/data/campus';
import type { ActiveRoute } from '@/types';
import { instruction } from '@/utils/graph';
import { routeStats } from '@/utils/routeStats';

interface Props {
  route: ActiveRoute;
  stepIdx: number;
  onNavigate: (node: string) => void;
  onClose: () => void;
}

/** 전체 경로 — 지도 위 경로선 + 예상 소요 시간 + 단계 목록 (단계를 누르면 그 지점으로 이동) */
export default function RouteOverview({ route, stepIdx, onNavigate, onClose }: Props) {
  const last = route.path.length - 1;
  const stats = routeStats(route.path);
  const extras = [
    `약 ${stats.meters >= 1000 ? `${(stats.meters / 1000).toFixed(1)}km` : `${stats.meters}m`}`,
    stats.stairs ? `계단 ${stats.stairs}번` : '',
    stats.elevators ? `엘리베이터 ${stats.elevators}번` : '',
  ].filter(Boolean);

  return (
    <div className="screen route-overview" role="dialog" aria-label="전체 경로">
      <RouteMap path={route.path} />

      <section className="route-sheet">
        <div className="sheet-grip" />
        <div className="route-sheet-head">
          <div>
            <p className="route-time">
              {stats.minutes}
              <small>분</small>
            </p>
            <p className="route-extra">
              도보 · {extras.join(' · ')} <span>(예상)</span>
            </p>
          </div>
          <button className="route-close" onClick={onClose} aria-label="닫기">
            <IconClose />
          </button>
        </div>

        <div className="route-ends">
          <span className="route-end-dot" />
          <b>{route.from.label}</b>
          <span className="route-ends-arrow">→</span>
          <span className="route-end-dot is-end" />
          <b>{route.to.label}</b>
        </div>

        <p className="route-steps-title">단계별 안내 · {last}단계</p>
        <ol className="steps">
          {route.path.map((id, i) => (
            <li key={id} className={i === stepIdx ? 'is-current' : i < stepIdx ? 'is-done' : ''}>
              <button
                onClick={() => {
                  onNavigate(id);
                  onClose();
                }}
              >
                <img src={thumbUrl(id)} alt="" loading="lazy" />
                <span>
                  <b>
                    {i === last ? `도착 · ${route.to.label}` : instruction(id, route.path[i + 1])}
                  </b>
                  <small>{NODE_BY_ID.get(id)?.title}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
