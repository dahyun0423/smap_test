import { IconEye } from '@/components/common/Icons';
import {
  BUILDING_BY_ID,
  type BuildingId,
  NODE_BY_ID,
  PLACES,
  type Place,
  buildingPhotoUrl,
  thumbUrl,
} from '@/data/campus';
import { floorsOf } from '@/utils/rooms';

interface Props {
  building: BuildingId;
  onClose: () => void;
  /** 거리뷰 열기 (지점 id) */
  onExplore: (node: string) => void;
  onSetFrom: (p: Place) => void;
  onSetTo: (p: Place) => void;
}

/** 지도에서 건물을 눌렀을 때 — 사진·설명·층별 거리뷰·주요 시설·길찾기 */
export default function BuildingSheet({ building, onClose, onExplore, onSetFrom, onSetTo }: Props) {
  const b = BUILDING_BY_ID.get(building);
  if (!b) return null;

  const places = PLACES.filter((x) => NODE_BY_ID.get(x.node)?.building === b.id);
  const main = places.find((x) => x.kind === 'building') ?? places[0];
  const floors = floorsOf(b.id);
  // 칩은 시설·부서만 — 연구실·강의실은 수가 많아 검색으로 찾게 한다
  const chips = places.filter((x) => x.kind === 'facility' || x.kind === 'office').slice(0, 12);
  const roomCount = places.filter((x) => x.kind === 'professor' || x.kind === 'room').length;

  // 버튼 동작 후 시트를 닫는다
  const then = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet bld-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={b.name}
      >
        <div className="sheet-grip" />
        {b.photo ? (
          <figure className="bld-figure">
            <img className="bld-photo" src={buildingPhotoUrl(b.id)} alt={`${b.name} 사진`} />
            {b.photo === 'school' && <figcaption>사진: 서경대학교 캠퍼스맵</figcaption>}
          </figure>
        ) : (
          main && <img className="bld-photo" src={thumbUrl(main.node)} alt={`${b.name} 사진`} />
        )}
        <h3>{b.name}</h3>
        {b.depts && <p className="bld-depts">{b.depts}</p>}
        <p className="sheet-sub">{b.desc}</p>

        {floors.length > 1 && (
          <div className="bld-floors" aria-label="층별 거리뷰">
            {floors.map((f) => (
              <button
                key={f.floor}
                onClick={then(() => onExplore(f.node))}
                aria-label={`${f.floor} 거리뷰`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {chips.length > 0 && (
          <div className="bld-places">
            {chips.map((x) => (
              <button key={x.id} className="chip chip-ghost" onClick={then(() => onSetTo(x))}>
                {x.name}
                {x.sample ? ' (예시)' : ''}
              </button>
            ))}
          </div>
        )}
        {roomCount > 0 && (
          <p className="sheet-sub">
            교수 연구실·강의실 {roomCount}곳 — 검색창에 호수나 이름을 입력하세요
          </p>
        )}

        {main ? (
          <div className="bld-actions">
            <button className="btn btn-ghost" onClick={then(() => onExplore(main.node))}>
              <IconEye /> 거리뷰
            </button>
            <button className="btn btn-ghost" onClick={then(() => onSetFrom(main))}>
              여기서 출발
            </button>
            <button className="btn btn-primary" onClick={then(() => onSetTo(main))}>
              여기로 길찾기
            </button>
          </div>
        ) : (
          <p className="sheet-sub">아직 촬영된 사진이 없어요.</p>
        )}
      </div>
    </div>
  );
}
