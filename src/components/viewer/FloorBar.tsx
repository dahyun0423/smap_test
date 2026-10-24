import { useEffect } from 'react';

import { BUILDING_BY_ID, type PanoNode } from '@/data/campus';

interface Props {
  here: PanoNode;
  /** 층 목록 (낮은 층 → 높은 층) */
  floors: { floor: string; label: string; node: string }[];
  onNavigate: (node: string) => void;
}

/** 건물 안 거리뷰 왼쪽의 세로 층 이동 막대 (위층이 위) */
export default function FloorBar({ here, floors, onNavigate }: Props) {
  // 지점이 바뀌면 현재 층 버튼이 보이도록 스크롤
  useEffect(() => {
    document
      .querySelector('.floor-bar-list .is-current')
      ?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [here.id]);

  return (
    <nav className="floor-bar glass" aria-label="층 이동">
      <span className="floor-bar-name">{BUILDING_BY_ID.get(here.building)?.name}</span>
      <div className="floor-bar-list">
        {[...floors].reverse().map((f) => {
          const current = f.floor === here.floor;
          return (
            <button
              key={f.floor}
              className={current ? 'is-current' : ''}
              aria-current={current ? 'true' : undefined}
              onClick={() => !current && onNavigate(f.node)}
              aria-label={`${f.floor}로 이동`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
