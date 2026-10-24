import { useState } from 'react';

import { BUILDING_BY_ID, type BuildingId } from '@/data/campus';
import { type RawRoom, SHOW_DOOR_PHOTOS, boardsFor, doorUrl, roomsOnFloor } from '@/utils/rooms';

interface Props {
  building: BuildingId;
  floor: string;
  onClose: () => void;
}

// 방 목록 묶음 — 위에서부터 처음 맞는 묶음에 들어간다 (u = 학교 데이터 호실 용도)
const GROUPS: { label: string; test: (r: RawRoom) => boolean }[] = [
  { label: '강의실·실습실', test: (r) => /강의|실습|연습|스튜디오|Studio|실기/i.test(r.u + r.n) },
  { label: '교수연구실', test: (r) => r.u === '교수연구실' || /교수/.test(r.n) },
  { label: '사무실·학과', test: (r) => /사무|본부|학과|학부|센터|처$|과$/.test(r.u + r.n) },
  { label: '편의·기타', test: () => true },
];

/** 이 층의 방 목록 시트 (용도별 묶음) */
export default function FloorSheet({ building, floor, onClose }: Props) {
  const rooms = roomsOnFloor(building, floor);
  const boards = boardsFor(building, floor);
  const [zoom, setZoom] = useState<string | null>(null);
  const used = new Set<RawRoom>();
  const grouped = GROUPS.map((g) => {
    const list = rooms.filter((r) => !used.has(r) && g.test(r));
    list.forEach((r) => used.add(r));
    return { ...g, list };
  }).filter((g) => g.list.length);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet floor-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${floor} 방 목록`}
      >
        <div className="sheet-grip" />
        <h3>
          {BUILDING_BY_ID.get(building)?.name} {floor}
        </h3>
        <p className="sheet-sub">
          {rooms.length ? `이 층에 ${rooms.length}곳이 있어요` : '이 층의 호실 정보가 아직 없어요'}
        </p>

        {SHOW_DOOR_PHOTOS && boards.length > 0 && (
          <div className="floor-boards">
            {boards.map((b) => (
              <button key={b.p} onClick={() => setZoom(b.p)} aria-label={`${b.n} 크게 보기`}>
                <img src={doorUrl(b.p)} alt="" loading="lazy" />
                <span>{b.n}</span>
              </button>
            ))}
          </div>
        )}

        {grouped.map((g) => (
          <section key={g.label} className="floor-group">
            <h4>
              {g.label} <small>{g.list.length}</small>
            </h4>
            <ul>
              {g.list.map((r, i) => (
                <li key={`${r.h}-${i}`}>
                  <b className="room-no">{r.h || '—'}</b>
                  <span className="room-name">
                    {r.n}
                    {r.field && <em>현장 확인</em>}
                  </span>
                  {SHOW_DOOR_PHOTOS && r.photo && (
                    <button
                      className="room-photo"
                      onClick={() => setZoom(r.photo!)}
                      aria-label={`${r.h}호 문 앞 사진`}
                    >
                      <img src={doorUrl(r.photo)} alt="" loading="lazy" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {zoom && (
        <div
          className="photo-zoom"
          onClick={(e) => {
            e.stopPropagation();
            setZoom(null);
          }}
          role="dialog"
          aria-label="사진 크게 보기"
        >
          <img src={doorUrl(zoom)} alt="" />
        </div>
      )}
    </div>
  );
}
