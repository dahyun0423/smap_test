import { NODE_BY_ID, type Place } from '@/data/campus';

interface Props {
  /** 같은 지점에 모인 편의시설들 */
  places: Place[];
  onPick: (p: Place) => void;
  onClose: () => void;
}

/** 한 지점에 편의시설이 여러 개일 때 목적지를 고르는 시트 */
export default function FacilitySheet({ places, onPick, onClose }: Props) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="이곳의 편의시설"
      >
        <div className="sheet-grip" />
        <h3>{NODE_BY_ID.get(places[0].node)?.title}</h3>
        <p className="sheet-sub">어디로 갈까요?</p>
        <div className="bld-places">
          {places.map((x) => (
            <button key={x.id} className="chip chip-ghost" onClick={() => onPick(x)}>
              {x.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
