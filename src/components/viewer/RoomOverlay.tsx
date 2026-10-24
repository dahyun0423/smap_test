import { useState } from 'react';

import type { BuildingId } from '@/data/campus';
import { type RawRoom, roomsOnFloor } from '@/utils/rooms';

// 층 대표 지점(엘리베이터 앞)에서 거리뷰 오른쪽에 띄우는 방 목록.
// 사진을 덜 가리도록 이름은 한 줄 말줄임, 누르면 펼친다.

/** '홍길동 교수연구실' → '홍길동 교수님'. 이름 없이 '교수연구실'이면 그대로, 호수뿐이면 빈칸 */
function label(r: RawRoom) {
  const n = /\S\s*교수\s*연구실$/.test(r.n) ? r.n.replace(/\s*교수\s*연구실$/, ' 교수님') : r.n;
  return n === `${r.h}호` ? '' : n;
}

export default function RoomOverlay({ building, floor }: { building: BuildingId; floor: string }) {
  const rooms = roomsOnFloor(building, floor);
  const [open, setOpen] = useState(true);
  const [full, setFull] = useState<number | null>(null);
  if (!rooms.length) return null;

  return (
    <aside className={`room-overlay ${open ? '' : 'is-folded'}`} aria-label={`${floor} 방 목록`}>
      <button className="room-overlay-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <b>
          {floor} · {rooms.length}곳
        </b>
        <span>{open ? '접기' : '펼치기'}</span>
      </button>
      {open && (
        <ul>
          {rooms.map((r, i) => (
            <li
              key={`${r.h}-${i}`}
              className={full === i ? 'is-full' : ''}
              onClick={() => setFull(full === i ? null : i)}
              title={label(r)}
            >
              <b>{r.h ? `${r.h}호` : ''}</b>
              <span>{label(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
