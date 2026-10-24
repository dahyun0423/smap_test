import { NODE_BY_ID, thumbUrl } from '@/data/campus';
import type { ActiveRoute } from '@/types';
import { instruction } from '@/utils/graph';

interface Props {
  route: ActiveRoute;
  stepIdx: number;
  onNavigate: (node: string) => void;
  onClose: () => void;
}

/** 전체 경로 단계 목록 — 누르면 그 단계로 이동 */
export default function StepsSheet({ route, stepIdx, onNavigate, onClose }: Props) {
  const last = route.path.length - 1;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet steps-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="전체 경로"
      >
        <div className="sheet-grip" />
        <h3>
          {route.from.label} → {route.to.label}
        </h3>
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
      </div>
    </div>
  );
}
