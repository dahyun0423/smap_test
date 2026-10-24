import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PanoViewer, { type ViewLink } from '@/components/viewer/PanoViewer';
import {
  BUILDINGS,
  BUILDING_BY_ID,
  type BuildingId,
  NODES,
  NODE_BY_ID,
  PLACES,
  type PanoNode,
  type Via,
  thumbUrl,
} from '@/data/campus';
import {
  BASE_EDITS,
  EDIT_KEY,
  type Edits,
  type ElevLine,
  editCount,
  linkKey,
  loadEdits,
  loadLegacyEdits,
  saveEdits,
} from '@/data/edits';
import type { Mark } from '@/data/edits';
import {
  type FloorPano,
  TAG_KEY,
  elevLinesOf,
  floorLevel,
  loadFloorPanos,
  setElevLinesLive,
  setFloorOrderLive,
} from '@/data/floorPanos';
import { getAuthor, saveShared, setAuthor, sharedEnabled, sharedState } from '@/data/sharedEdits';
import { exportZip } from '@/utils/exportCsv';
import {
  VIA_LABEL,
  isBlocked,
  linkYaw,
  rawLinksOf,
  relinkElevators,
  relinkLines,
  setBlockedLive,
  setEditYaw,
  setLinkLive,
} from '@/utils/graph';
import { marksOf, setMarksLive } from '@/utils/marks';
import { floorNodes, roomsOnFloor, setElevLive, setFloorRoomsLive } from '@/utils/rooms';

// 사진 편집기 (?tag=1) — 팀이 앱 데이터(이름·연결·방향·층·방 목록 등)를 고치는 PC용 화면. 3단: 목록 · 360 · 속성.
// 고친 값은 즉시 화면에 반영되고 공유 저장소(sharedEdits.ts)에 버전으로 쌓인다. 꺼져 있으면 이 브라우저에만 저장.
// ⌘Z로 되돌리기. 숨긴 사진도 그대로 보여 준다(rawLinksOf).
// 확정된 값은 내보내기 JSON을 edits.json · floor-panos.json에 반영한다.

const FLOOR = new Map(loadFloorPanos().map((r) => [r.id, r]));
const VIAS = Object.keys(VIA_LABEL) as Via[];
const B_OPTIONS: { id: BuildingId; name: string }[] = [
  ...BUILDINGS.map((b) => ({ id: b.id, name: b.name })),
  { id: 'outdoor', name: '야외·주차장' },
];
/** 장소 객체를 직접 고친다 (null = 원래 도착 사진) */
const placeTo = (pid: string, node: string | null) => {
  const p = PLACE_BY_ID.get(pid);
  const d = PLACE_DEFAULT.get(pid);
  if (!p || !d) return;
  if (node)
    Object.assign(p, { node, basis: 'editor', sub: d.sub?.replace(' · 건물 입구까지 안내', '') });
  else Object.assign(p, d);
};
/** 지점 객체를 직접 고친다 (새로고침 없이 그래프에 반영하려고) */
const patchNode = (id: string, patch: Partial<PanoNode>) => {
  const n = NODE_BY_ID.get(id);
  if (n) Object.assign(n, patch);
};
const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));
// 장소의 원래 도착 사진 (되돌리기용)
const PLACE_DEFAULT = new Map(
  PLACES.map((p) => [p.id, p.base ?? { node: p.node, basis: p.basis, sub: p.sub }])
);
const norm = (s: string) => s.replace(/[\s_]+/g, '');
/** 배열에서 from 위치 항목을 to 위치로 옮긴다 (드래그 정렬) */
const moved = <T,>(arr: T[], from: number, to: number) => {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
};
const isFloor = (f?: string | null): f is string => !!f && /층$|^B\d+$/.test(f);
const bName = (b: BuildingId) =>
  b === 'outdoor' ? '야외·주차장' : (BUILDING_BY_ID.get(b)?.name ?? b);

type FloorEdits = Record<string, Partial<FloorPano>>;
interface Snapshot {
  edits: Edits;
  floors: FloorEdits;
}

function loadFloors(): FloorEdits {
  const shared = sharedState();
  if (shared) return shared.floors as FloorEdits;
  return loadLegacyFloors();
}
function loadLegacyFloors(): FloorEdits {
  try {
    return JSON.parse(localStorage.getItem(TAG_KEY) ?? '{}');
  } catch {
    return {};
  }
}
/** 이 브라우저에만 저장된 예전 값을 공유 값 위에 합친다 (최초 1회) */
function withLegacy(s: Snapshot): Snapshot | null {
  if (!sharedState()) return null;
  const e = loadLegacyEdits(),
    f = loadLegacyFloors();
  if (editCount(e) + Object.keys(f).length === 0) return null;
  const lk = (x: { a: string; b: string }) => linkKey(x.a, x.b);
  const add = new Map(s.edits.add.map((x) => [lk(x), x]));
  for (const k of e.remove) add.delete(k);
  for (const x of e.add) add.set(lk(x), x);
  const remove = [
    ...new Set([...s.edits.remove.filter((k) => !e.add.some((x) => lk(x) === k)), ...e.remove]),
  ];
  const d = (k: keyof Edits) => ({ ...(s.edits[k] as object), ...(e[k] as object) });
  return {
    edits: {
      titles: d('titles'),
      add: [...add.values()],
      remove,
      rooms: d('rooms'),
      yaw: d('yaw'),
      blocked: d('blocked'),
      floorRooms: d('floorRooms'),
      hidden: d('hidden'),
      placeNode: d('placeNode'),
      marks: d('marks'),
      elev: d('elev'),
    } as Edits,
    floors: { ...s.floors, ...f },
  };
}

/** '문예관_9층_중앙' → 건물·층 (층까지 읽히는 이름만) */
function driveFloor(n?: string): { b: BuildingId; f: string } | null {
  const b = n && B_OPTIONS.find((o) => o.id !== 'outdoor' && n.startsWith(o.name));
  const m = n?.match(/_(지하\d|B\d|\d+|L)층/);
  if (!b || !m) return null;
  return {
    b: b.id,
    f: m[1].startsWith('지하') ? `B${m[1].slice(2)}` : m[1].startsWith('B') ? m[1] : `${m[1]}층`,
  };
}

export default function Editor({ onClose }: { onClose: () => void }) {
  const [snap, setSnap] = useState<Snapshot>(() => ({ edits: loadEdits(), floors: loadFloors() }));
  const [past, setPast] = useState<Snapshot[]>([]);
  const [sel, setSel] = useState(
    () => new URLSearchParams(location.search).get('node') ?? NODES[0].id
  );
  const [q, setQ] = useState('');
  const [bFilter, setBFilter] = useState<BuildingId | 'all' | 'changed' | 'hidden'>('all');
  const [addQ, setAddQ] = useState('');
  const [addVia, setAddVia] = useState<Via>('walk');
  const [placeQ, setPlaceQ] = useState('');
  const [saved, setSaved] = useState('');
  // 화살표 방향을 맞추는 중인 연결 (사진을 클릭하면 그 방향으로 저장)
  const [yawFor, setYawFor] = useState<string | null>(null);
  // 사진 속 표시 위치 지정 중 — 'label'·'block' = 새로 추가, 숫자 = 그 표시 옮기기
  const [markFor, setMarkFor] = useState<'label' | 'block' | number | null>(null);
  const [, setRev] = useState(0); // 그래프를 직접 바꾼 뒤 다시 그리기
  // 드래그 중인 항목 — 목록(k)의 i번째
  const [drag, setDrag] = useState<{ k: string; i: number } | null>(null);
  const grip = (k: string, i: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDrag({ k, i });
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
    },
    onDragEnd: () => setDrag(null),
  });
  const dropAt = (k: string, i: number, move: (from: number, to: number) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      if (drag?.k === k) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (drag?.k === k && drag.i !== i) move(drag.i, i);
      setDrag(null);
    },
    className: drag?.k === k ? (drag.i === i ? 'is-dragging' : 'is-drop') : undefined,
  });
  // 처음 건드린 연결의 원래 상태 (linkKey → 원래 이동 방식, 없던 연결이면 null)
  const orig = useRef(new Map<string, Via | null>());

  const here = NODE_BY_ID.get(sel) ?? NODES[0];
  const row = FLOOR.get(here.id);
  const drive = row?.n;
  const changed = useCallback(
    (id: string) =>
      !!(
        snap.edits.titles[id] ||
        snap.floors[id] ||
        id in snap.edits.rooms ||
        id in snap.edits.blocked ||
        id in snap.edits.hidden ||
        Object.values(snap.edits.placeNode).includes(id) ||
        id in snap.edits.marks ||
        Object.keys(snap.edits.yaw).some((k) => k.startsWith(`${id}>`)) ||
        snap.edits.add.some((x) => x.a === id || x.b === id) ||
        snap.edits.remove.some((k) => k.split('|').includes(id))
      ),
    [snap]
  );

  // 공유 저장 — 연달아 고치면 0.8초 모아서 한 번에 보낸다
  const [sync, setSync] = useState(
    sharedEnabled()
      ? sharedState()?.id
        ? `공유 저장소 v${sharedState()!.id}`
        : '공유 저장소 연결됨'
      : '이 브라우저에만 저장'
  );
  const [author, setAuthorState] = useState(getAuthor);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushShared = useCallback((s: Snapshot) => {
    if (!sharedEnabled()) return;
    if (pending.current) clearTimeout(pending.current);
    setSync('저장 중…');
    pending.current = setTimeout(async () => {
      const r = await saveShared(
        s.edits as unknown as Record<string, unknown>,
        s.floors as Record<string, unknown>
      );
      if (!r.ok) setSync('⚠ 공유 저장 실패 — 이 브라우저엔 저장됨, 잠시 뒤 다시 고치면 재시도');
      else
        setSync(
          r.merged
            ? `모두에게 저장됨 v${r.id} · 다른 사람 수정과 합침 (새로고침하면 다 보여요)`
            : `모두에게 저장됨 v${r.id}`
        );
    }, 800);
  }, []);

  /** 고친 값 저장 + 되돌리기 기록 */
  const commit = useCallback(
    (next: Snapshot, msg: string) => {
      setPast((h) => [...h.slice(-49), snap]);
      setSnap(next);
      saveEdits(next.edits);
      try {
        localStorage.setItem(
          sharedState() ? `${TAG_KEY}.backup` : TAG_KEY,
          JSON.stringify(next.floors)
        );
      } catch {
        /* 저장 불가 */
      }
      pushShared(next);
      setSaved(msg);
      setRev((r) => r + 1);
    },
    [snap, pushShared]
  );

  // 이 브라우저에만 있던 예전 값을 공유 저장소로 옮긴다 (최초 1회)
  useEffect(() => {
    const merged = withLegacy(snap);
    if (!merged) return;
    pushShared(merged);
    setSnap(merged); // eslint-disable-line react-hooks/set-state-in-effect -- 처음 한 번 옮기기
    setSaved('이 브라우저에만 있던 수정값을 모두에게 옮겼어요 (새로고침하면 지도에도 반영)');
    try {
      for (const k of [EDIT_KEY, TAG_KEY]) {
        const v = localStorage.getItem(k);
        if (v) {
          localStorage.setItem(`${k}.migrated`, v);
          localStorage.removeItem(k);
        }
      }
    } catch {
      /* 저장 불가 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 스냅샷 기준으로 그래프·지점을 맞춘다 (되돌리기용) */
  const applyLive = (s: Snapshot, prev: Snapshot) => {
    const keys = new Set([
      ...prev.edits.add.map((x) => linkKey(x.a, x.b)),
      ...prev.edits.remove,
      ...s.edits.add.map((x) => linkKey(x.a, x.b)),
      ...s.edits.remove,
    ]);
    for (const k of keys) {
      const [a, b] = k.split('|');
      const added = s.edits.add.find((x) => linkKey(x.a, x.b) === k);
      if (added) setLinkLive(a, b, added.via);
      else if (s.edits.remove.includes(k)) setLinkLive(a, b, null);
      else if (orig.current.has(k)) setLinkLive(a, b, orig.current.get(k)!);
    }
    for (const k of new Set([...Object.keys(prev.edits.yaw), ...Object.keys(s.edits.yaw)]))
      setEditYaw(k, s.edits.yaw[k] ?? null);
    for (const id of new Set([...Object.keys(prev.edits.blocked), ...Object.keys(s.edits.blocked)]))
      setBlockedLive(id, id in s.edits.blocked);
    for (const k of new Set([
      ...Object.keys(prev.edits.floorRooms),
      ...Object.keys(s.edits.floorRooms),
    ])) {
      const [b, f] = k.split('|') as [BuildingId, string];
      setFloorRoomsLive(b, f, s.edits.floorRooms[k] ?? null);
    }
    for (const k of new Set([
      ...Object.keys(prev.edits.elev ?? {}),
      ...Object.keys(s.edits.elev ?? {}),
    ])) {
      setElevLive(k, s.edits.elev?.[k] ?? null);
      relinkElevators(k.split('|')[0]);
    }
    for (const b of new Set([
      ...Object.keys(prev.edits.floorOrder ?? {}),
      ...Object.keys(s.edits.floorOrder ?? {}),
    ])) {
      setFloorOrderLive(b as BuildingId, s.edits.floorOrder?.[b] ?? null);
      relinkElevators(b);
      relinkLines(b);
    }
    for (const b of new Set([
      ...Object.keys(prev.edits.elevLines ?? {}),
      ...Object.keys(s.edits.elevLines ?? {}),
    ])) {
      setElevLinesLive(b, s.edits.elevLines?.[b] ?? null);
      relinkLines(b);
    }
    for (const id of new Set([...Object.keys(prev.edits.marks), ...Object.keys(s.edits.marks)]))
      setMarksLive(id, s.edits.marks[id] ?? BASE_EDITS.marks[id] ?? null);
    for (const id of new Set([
      ...Object.keys(prev.edits.placeNode),
      ...Object.keys(s.edits.placeNode),
    ]))
      placeTo(id, s.edits.placeNode[id] ?? null);
    for (const id of new Set([...Object.keys(prev.edits.hidden), ...Object.keys(s.edits.hidden)]))
      patchNode(id, { hidden: id in s.edits.hidden });
    for (const id of new Set([...Object.keys(prev.edits.titles), ...Object.keys(s.edits.titles)])) {
      const t = s.edits.titles[id] ?? BASE_EDITS.titles[id] ?? FLOOR.get(id)?.t;
      if (t) patchNode(id, { title: t });
    }
  };

  const undo = useCallback(() => {
    setPast((h) => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      applyLive(prev, snap);
      setSnap(prev);
      saveEdits(prev.edits);
      pushShared(prev);
      setSaved('되돌렸어요');
      setRev((r) => r + 1);
      return h.slice(0, -1);
    });
  }, [snap, pushShared]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        undo();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [undo]);

  useEffect(() => {
    history.replaceState(history.state, '', `?tag=1&node=${encodeURIComponent(sel)}`);
    document.querySelector('.ed-item.is-sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  // ── 고치기
  const setTitle = (t: string) => {
    t = t.trim();
    if (!t || t === here.title) return;
    patchNode(here.id, { title: t });
    commit(
      { ...snap, edits: { ...snap.edits, titles: { ...snap.edits.titles, [here.id]: t } } },
      '이름을 바꿨어요'
    );
  };
  const setFloor = (patch: Partial<FloorPano>) => {
    patchNode(here.id, {
      ...(patch.b ? { building: patch.b } : {}),
      ...(patch.f !== undefined ? { floor: patch.f ?? undefined } : {}),
    });
    commit(
      { ...snap, floors: { ...snap.floors, [here.id]: { ...snap.floors[here.id], ...patch } } },
      '건물·층을 바꿨어요 (층 버튼 연결은 새로고침 후 반영)'
    );
  };
  const toggleRooms = () => {
    const on = !(here.roomList ?? !!here.center);
    patchNode(here.id, { roomList: on });
    commit(
      { ...snap, edits: { ...snap.edits, rooms: { ...snap.edits.rooms, [here.id]: on } } },
      on ? '이 자리에서 방 목록을 띄워요' : '방 목록을 껐어요'
    );
  };
  const setLink = (to: string, via: Via | null) => {
    const k = linkKey(here.id, to);
    const e = snap.edits;
    const add = e.add.filter((x) => linkKey(x.a, x.b) !== k);
    const remove = e.remove.filter((x) => x !== k);
    const wasNew = e.add.some((x) => linkKey(x.a, x.b) === k);
    if (!orig.current.has(k))
      orig.current.set(k, rawLinksOf(here.id).find((l) => l.to === to)?.via ?? null);
    if (via) add.push({ a: here.id, b: to, via });
    // 원래 있던 연결을 끊음
    else if (!wasNew) remove.push(k);
    setLinkLive(here.id, to, via);
    commit(
      { ...snap, edits: { ...e, add, remove } },
      via ? `${NODE_BY_ID.get(to)?.title}과(와) 이었어요` : '연결을 끊었어요'
    );
  };
  const pickYaw = (deg: number) => {
    if (!yawFor) return;
    const k = `${here.id}>${yawFor}`;
    setEditYaw(k, deg);
    commit(
      { ...snap, edits: { ...snap.edits, yaw: { ...snap.edits.yaw, [k]: deg } } },
      `「${NODE_BY_ID.get(yawFor)?.title}」 화살표 방향을 맞췄어요`
    );
    setYawFor(null);
  };
  const marks = marksOf(here.id);
  const setMarks = (list: Mark[], msg: string) => {
    setMarksLive(here.id, list);
    const all = { ...snap.edits.marks };
    // edits.json의 기본 표시를 모두 지운 경우 빈 목록으로 남겨야 기본값이 되살아나지 않는다
    if (list.length || BASE_EDITS.marks[here.id]) all[here.id] = list;
    else delete all[here.id];
    commit({ ...snap, edits: { ...snap.edits, marks: all } }, msg);
  };
  const pickMark = (yaw: number, pitch: number) => {
    if (markFor === 'block')
      setMarks(
        [
          ...marks,
          { kind: 'block', yaw, pitch, title: '카드키 있는 사람만 들어갈 수 있어요', desc: '' },
        ],
        '출입 제한 표시를 넣었어요 — 오른쪽에서 설명을 적어 주세요'
      );
    else if (markFor === 'label')
      setMarks(
        [...marks, { kind: 'label', yaw, pitch, title: '이름 입력', desc: '' }],
        '이름표를 꽂았어요 — 오른쪽에서 이름(예: 우체국)을 적어 주세요'
      );
    else if (markFor !== null)
      setMarks(
        marks.map((m, i) => (i === markFor ? { ...m, yaw, pitch } : m)),
        '표시 위치를 옮겼어요'
      );
    setMarkFor(null);
  };
  // 층별 엘리베이터 앞 지정 — 층 버튼 이동 위치, 위·아래층과 자동 연결
  const elevKey =
    here.building !== 'outdoor' && here.floor ? `${here.building}|${here.floor}` : null;
  const isElev = !!elevKey && floorNodes().get(elevKey) === here.id;
  const elevPicked = !!elevKey && snap.edits.elev?.[elevKey] === here.id;
  const setElev = (on: boolean) => {
    if (!elevKey) return;
    setElevLive(elevKey, on ? here.id : null);
    relinkElevators(here.building);
    const elev = { ...(snap.edits.elev ?? {}) };
    if (on) elev[elevKey] = here.id;
    else delete elev[elevKey];
    commit(
      { ...snap, edits: { ...snap.edits, elev } },
      on
        ? `${bName(here.building)} ${here.floor} 엘리베이터 앞으로 정했어요 — 층 버튼이 여기로 오고, 위·아래 층과 엘리베이터로 이어져요`
        : '엘리베이터 앞 지정을 풀었어요'
    );
  };
  const blockedNow = isBlocked(here.id);
  const setBlock = (on: boolean, why = '') => {
    setBlockedLive(here.id, on);
    const blocked = { ...snap.edits.blocked };
    if (on) blocked[here.id] = why;
    else delete blocked[here.id];
    commit(
      { ...snap, edits: { ...snap.edits, blocked } },
      on ? '이 지점을 막았어요 — 길안내가 돌아가요' : '통행을 다시 열었어요'
    );
  };
  /** 사진 숨기기/다시 보이기 */
  const setHidden = (id: string, on: boolean) => {
    patchNode(id, { hidden: on });
    const hidden = { ...snap.edits.hidden };
    if (on) hidden[id] = true;
    else delete hidden[id];
    commit(
      { ...snap, edits: { ...snap.edits, hidden } },
      on
        ? `「${NODE_BY_ID.get(id)?.title}」을(를) 숨겼어요 — 앞뒤 사진끼리 바로 이어져요`
        : '다시 보이게 했어요'
    );
  };
  const floorKey =
    here.building !== 'outdoor' && here.floor ? `${here.building}|${here.floor}` : null;
  const floorList = floorKey
    ? (snap.edits.floorRooms[floorKey] ??
      roomsOnFloor(here.building, here.floor!).map((x) => ({ h: x.h, n: x.n })))
    : [];
  const setFloorList = (list: { h: string; n: string }[] | null, msg: string) => {
    if (!floorKey) return;
    setFloorRoomsLive(here.building, here.floor!, list);
    const floorRooms = { ...snap.edits.floorRooms };
    if (list) floorRooms[floorKey] = list;
    else delete floorRooms[floorKey];
    commit({ ...snap, edits: { ...snap.edits, floorRooms } }, msg);
  };
  // 건물 층 순서 (드래그로 바꾸면 층 버튼·엘리베이터 연결 순서가 바뀐다)
  const bHere = here.building;
  const bFloors =
    bHere === 'outdoor'
      ? []
      : [
          ...new Set(
            NODES.filter((n) => n.building === bHere && isFloor(n.floor)).map((n) => n.floor!)
          ),
        ].sort((p, q) => floorLevel(bHere, q) - floorLevel(bHere, p));
  const setFloorOrder = (topFirst: string[] | null, msg: string) => {
    const order = topFirst && [...topFirst].reverse();
    setFloorOrderLive(bHere, order);
    relinkElevators(bHere);
    relinkLines(bHere);
    const floorOrder = { ...(snap.edits.floorOrder ?? {}) };
    if (order) floorOrder[bHere] = order;
    else delete floorOrder[bHere];
    commit({ ...snap, edits: { ...snap.edits, floorOrder } }, msg);
  };
  // 엘리베이터 노선 — 같은 노선 사진끼리만 층 순서대로 이어진다
  const lines = elevLinesOf(bHere);
  const setLines = (next: ElevLine[] | null, msg: string) => {
    setElevLinesLive(bHere, next);
    relinkLines(bHere);
    relinkElevators(bHere);
    const elevLines = { ...(snap.edits.elevLines ?? {}) };
    if (next) elevLines[bHere] = next;
    else delete elevLines[bHere];
    commit({ ...snap, edits: { ...snap.edits, elevLines } }, msg);
  };
  /** 이 사진을 i번째 노선에 넣는다 (같은 층 사진이 있으면 교체) */
  const joinLine = (i: number) =>
    setLines(
      lines.map((l, j) =>
        j !== i
          ? l
          : {
              ...l,
              nodes: [...l.nodes.filter((id) => NODE_BY_ID.get(id)?.floor !== here.floor), here.id],
            }
      ),
      `「${lines[i].name}」 ${here.floor}에 이 사진을 넣었어요 — 같은 엘리베이터의 위·아래 층과 이어져요`
    );
  const leaveLine = (i: number, id = here.id) =>
    setLines(
      lines.map((l, j) => (j !== i ? l : { ...l, nodes: l.nodes.filter((x) => x !== id) })),
      `「${lines[i].name}」에서 뺐어요`
    );
  /** 이 건물 해당 층의 사진들 */
  const floorPhotos = (f: string) =>
    NODES.filter((n) => n.building === bHere && n.floor === f && !n.flat);
  const lineStops = (l: ElevLine) =>
    l.nodes
      .filter((id) => isFloor(NODE_BY_ID.get(id)?.floor))
      .sort(
        (p, q) =>
          floorLevel(bHere, NODE_BY_ID.get(q)!.floor!) -
          floorLevel(bHere, NODE_BY_ID.get(p)!.floor!)
      );

  const fromDrive = () => {
    const floors = { ...snap.floors };
    let n = 0;
    for (const r of FLOOR.values()) {
      const s = driveFloor(r.n);
      const cur = { ...r, ...floors[r.id] };
      if (!s || (s.b === cur.b && s.f === cur.f)) continue;
      floors[r.id] = { ...floors[r.id], b: s.b, f: s.f };
      patchNode(r.id, { building: s.b, floor: s.f });
      n++;
    }
    commit({ ...snap, floors }, `드라이브 파일명대로 ${n}장의 건물·층을 맞췄어요`);
  };
  // 건물 필터가 있으면 그 건물만, 없으면 전체
  const scope =
    bFilter !== 'all' && bFilter !== 'changed' && bFilter !== 'hidden' && bFilter !== 'outdoor'
      ? bFilter
      : null;
  const exportAll = () => {
    exportZip(snap.edits, snap.floors, scope);
    setSaved(
      `${scope ? bName(scope) : '전체'} CSV를 내보냈어요 (팀 CSV 양식 nodes·edges + places) — zip을 개발자에게 보내 주세요`
    );
  };
  /** 장소의 도착 사진을 이 사진으로 지정 (null = 원래대로) */
  const setPlace = (pid: string, node: string | null) => {
    placeTo(pid, node);
    const placeNode = { ...snap.edits.placeNode };
    if (node) placeNode[pid] = node;
    else delete placeNode[pid];
    commit(
      { ...snap, edits: { ...snap.edits, placeNode } },
      node
        ? `「${PLACE_BY_ID.get(pid)?.name}」을(를) 이 사진으로 안내해요`
        : '원래 도착 사진으로 되돌렸어요'
    );
  };

  // ── 목록
  const list = useMemo(() => {
    const s = q.trim().replace(/[\s_]+/g, '');
    return NODES.filter(
      (n) =>
        !n.flat &&
        (bFilter === 'all' ||
          (bFilter === 'changed'
            ? changed(n.id)
            : bFilter === 'hidden'
              ? n.hidden
              : n.building === bFilter)) &&
        (!s ||
          [n.title, n.id, FLOOR.get(n.id)?.n ?? ''].some((t) =>
            t.replace(/[\s_]+/g, '').includes(s)
          ))
    );
  }, [q, bFilter, changed]);

  const links = rawLinksOf(here.id);
  const viewLinks: ViewLink[] = links.map((l) => ({
    to: l.to,
    yaw: linkYaw(here.id, l.to),
    label: `${NODE_BY_ID.get(l.to)?.hidden ? '(숨김) ' : ''}${NODE_BY_ID.get(l.to)?.title ?? l.to}`,
    sub: l.via === 'walk' ? undefined : VIA_LABEL[l.via],
    editing: l.to === yawFor,
  }));
  // 이미 이어진 사진도 보여 준다 (이동 방식만 바꿀 수 있게)
  const addResults = (() => {
    const s = addQ
      .trim()
      .replace(/[\s_]+/g, '')
      .toLowerCase();
    if (!s) return [];
    return NODES.filter(
      (n) =>
        n.id !== here.id &&
        [n.title, FLOOR.get(n.id)?.n ?? '', n.id].some((t) =>
          t
            .replace(/[\s_]+/g, '')
            .toLowerCase()
            .includes(s)
        )
    ).slice(0, 12);
  })();
  const linkVia = new Map(links.map((l) => [l.to, l.via]));

  const herePlaces = PLACES.filter((p) => p.node === here.id && p.kind !== 'building');
  const placeResults = (() => {
    const s = norm(placeQ);
    if (!s) return [];
    return PLACES.filter(
      (p) =>
        p.node !== here.id &&
        [p.name, p.sub ?? '', ...(p.aliases ?? [])].some((t) => norm(t).includes(s))
    ).slice(0, 12);
  })();

  const count = editCount(snap.edits) + Object.keys(snap.floors).length;
  const roomsOn = here.roomList ?? !!here.center;

  return (
    <div className="ed">
      <header className="ed-top">
        <b>SMAP 사진 편집기</b>
        <span className="ed-status" role="status">
          {saved || '고치면 바로 반영되고 자동 저장돼요'}
        </span>
        <div className="ed-top-tools">
          <span
            className={`ed-sync ${sync.startsWith('⚠') ? 'is-bad' : ''}`}
            title="고친 내용은 모두가 같이 보는 저장소에 버전으로 쌓여요"
          >
            {sync}
          </span>
          {sharedEnabled() && (
            <input
              className="ed-input ed-author"
              value={author}
              placeholder="내 이름 (예: 다현)"
              aria-label="편집자 이름"
              onChange={(e) => {
                setAuthorState(e.target.value);
                setAuthor(e.target.value.trim());
              }}
            />
          )}
          <span className="ed-count">수정 {count}건</span>
          <button className="ed-btn" onClick={undo} disabled={!past.length} title="⌘Z">
            ↶ 되돌리기
          </button>
          <button className="ed-btn" onClick={fromDrive}>
            드라이브 이름대로 건물·층 맞추기
          </button>
          <button
            className="ed-btn ed-btn-primary"
            onClick={exportAll}
            title="팀 CSV 양식(nodes·edges) + 장소 매핑(places) zip — 건물 칩을 고르면 그 건물만"
          >
            {scope ? `${bName(scope)} ` : ''}CSV 내보내기
          </button>
          <button className="ed-btn" onClick={onClose}>
            앱으로
          </button>
        </div>
      </header>

      <aside className="ed-list">
        <input
          className="ed-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="사진 찾기 (예: 한림관 3층, 엘베앞)"
        />
        <div className="ed-chips">
          {(['all', 'changed', 'hidden'] as const).map((k) => (
            <button key={k} className={bFilter === k ? 'is-on' : ''} onClick={() => setBFilter(k)}>
              {{ all: '전체', changed: '고친 것', hidden: '숨긴 것' }[k]}
            </button>
          ))}
          {B_OPTIONS.map((o) => (
            <button
              key={o.id}
              className={bFilter === o.id ? 'is-on' : ''}
              onClick={() => setBFilter(o.id)}
            >
              {o.name}
            </button>
          ))}
        </div>
        <p className="ed-hint">{list.length}장</p>
        <ul>
          {list.map((n) => (
            <li key={n.id} className="ed-li">
              <button
                className={`ed-item ${n.id === sel ? 'is-sel' : ''} ${n.hidden ? 'is-hidden' : ''}`}
                onClick={() => setSel(n.id)}
              >
                <img src={thumbUrl(n.id)} alt="" loading="lazy" />
                <span>
                  <b>{n.title}</b>
                  <small>
                    {[bName(n.building), n.floor].filter(Boolean).join(' · ')}
                    {FLOOR.get(n.id)?.n && ` · ${FLOOR.get(n.id)!.n}`}
                  </small>
                </span>
                {changed(n.id) && <i className="ed-dot" aria-label="고침" />}
                {isBlocked(n.id) && (
                  <i className="ed-stop" aria-label="통행 막음">
                    ⛔
                  </i>
                )}
              </button>
              <button
                className={`ed-eye ${n.hidden ? 'is-off' : ''}`}
                onClick={() => setHidden(n.id, !n.hidden)}
                aria-label={n.hidden ? '다시 보이기' : '숨기기'}
                title={n.hidden ? '숨김 — 눌러서 다시 보이기' : '안 쓸 사진이면 눌러서 숨기기'}
              >
                {n.hidden ? <EyeOff /> : <Eye />}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="ed-view">
        <PanoViewer
          node={here}
          links={viewLinks}
          onNavigate={(to) => {
            setYawFor(null);
            setMarkFor(null);
            setSel(to);
          }}
          onPickYaw={markFor !== null ? pickMark : yawFor ? pickYaw : undefined}
          marks={marks.map((m, i) => ({ ...m, editing: markFor === i }))}
        />
        {markFor !== null ? (
          <div className="ed-yaw-bar">
            <span>
              사진에서{' '}
              <b>
                {markFor === 'label'
                  ? '이름표를 꽂을 곳'
                  : markFor === 'block'
                    ? '✕를 띄울 곳'
                    : '옮길 위치'}
              </b>
              {markFor === 'label' ? '(우체국 간판, ATM 등)' : markFor === 'block' ? '(문 등)' : ''}
              을 클릭하세요
            </span>
            <button className="ed-btn" onClick={() => setMarkFor(null)}>
              취소
            </button>
          </div>
        ) : yawFor ? (
          <div className="ed-yaw-bar">
            <span>
              사진에서 <b>「{NODE_BY_ID.get(yawFor)?.title}」</b> 쪽 길이 보이는 곳을 클릭하세요
            </span>
            <button className="ed-btn" onClick={() => setYawFor(null)}>
              취소
            </button>
          </div>
        ) : (
          <p className="ed-view-hint">
            사진 속 화살표를 누르면 그 사진으로 넘어가요 · 드래그해서 둘러보기
          </p>
        )}
        {here.hidden && (
          <p className="ed-blocked-badge ed-hidden-badge">숨긴 사진 · 사용자 앱에는 안 나와요</p>
        )}
        {blockedNow && (
          <p className="ed-blocked-badge">
            ⛔ 통행 막음{snap.edits.blocked[here.id] ? ` · ${snap.edits.blocked[here.id]}` : ''}
          </p>
        )}
      </main>

      <section className="ed-props" key={here.id}>
        <h2>{here.title}</h2>
        <p className="ed-hint">
          {here.id}
          {drive && (
            <>
              {' '}
              · 드라이브 <b>{drive}</b>
            </>
          )}
        </p>

        <label className="ed-label">화면·음성에 나오는 이름</label>
        <input
          key={here.title}
          className="ed-input"
          defaultValue={here.title}
          onBlur={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {drive && drive.replace(/_/g, ' ') !== here.title && (
          <button className="ed-link" onClick={() => setTitle(drive.replace(/_/g, ' '))}>
            드라이브 이름으로 바꾸기 → {drive.replace(/_/g, ' ')}
          </button>
        )}

        <label className="ed-label">건물 · 층</label>
        <div className="ed-row">
          <select
            className="ed-input"
            value={here.building}
            onChange={(e) => setFloor({ b: e.target.value as BuildingId })}
          >
            {B_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            key={here.floor}
            className="ed-input"
            defaultValue={here.floor ?? ''}
            placeholder="3층 · L층 · B1"
            onBlur={(e) => {
              const f = e.target.value.trim() || null;
              if (f !== (here.floor ?? null)) setFloor({ f });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>

        {here.building !== 'outdoor' && here.floor && (
          <button
            className={`ed-switch ${roomsOn ? 'is-on' : ''}`}
            role="switch"
            aria-checked={roomsOn}
            onClick={toggleRooms}
          >
            <span>
              <b>이 자리에서 방 목록 띄우기</b>
              <small>층 가운데만 찍었거나 못 들어가는 곳</small>
            </span>
            <i />
          </button>
        )}

        {elevKey && (
          <button
            className={`ed-switch ${elevPicked ? 'is-on' : ''}`}
            role="switch"
            aria-checked={elevPicked}
            onClick={() => setElev(!elevPicked)}
          >
            <span>
              <b>이 층 엘리베이터 앞</b>
              <small>
                {elevPicked
                  ? lines.length
                    ? '층 버튼을 누르면 이 사진으로 와요 · 잇는 건 아래 「엘리베이터」에서'
                    : '층 버튼을 누르면 이 사진으로 와요 · 위·아래 층 엘리베이터 앞과 이어져요'
                  : isElev
                    ? '지금 자동으로 층 대표예요 — 켜면 고정'
                    : `지금 층 버튼은 「${NODE_BY_ID.get(floorNodes().get(elevKey) ?? '')?.title ?? '없음'}」으로 가요`}
              </small>
            </span>
            <i />
          </button>
        )}

        <button
          className={`ed-switch ${here.hidden ? 'is-on' : ''}`}
          role="switch"
          aria-checked={!!here.hidden}
          onClick={() => setHidden(here.id, !here.hidden)}
        >
          <span>
            <b>이 사진 숨기기</b>
            <small>안 쓸 사진 — 사용자 앱에서 빠지고, 앞뒤 사진끼리 바로 이어져요</small>
          </span>
          <i />
        </button>

        <button
          className={`ed-switch ed-switch-danger ${blockedNow ? 'is-on' : ''}`}
          role="switch"
          aria-checked={blockedNow}
          onClick={() => setBlock(!blockedNow)}
        >
          <span>
            <b>지금 못 가게 막기</b>
            <small>공사·통제 등 — 길안내가 이 지점을 피해서 돌아가요</small>
          </span>
          <i />
        </button>
        {blockedNow && (
          <input
            key={'b' + here.id}
            className="ed-input ed-gap"
            defaultValue={snap.edits.blocked[here.id] ?? ''}
            placeholder="사유 (예: 축제 기간 통제, 공사 중)"
            onBlur={(e) =>
              e.target.value !== (snap.edits.blocked[here.id] ?? '') &&
              setBlock(true, e.target.value.trim())
            }
          />
        )}

        <label className="ed-label">
          사진 속 표시 <small>(이름표 · 출입 제한 ✕ — 누르면 설명)</small>
        </label>
        <ul className="ed-marks">
          {marks.map((m, i) => (
            <li key={`${here.id}-${i}-${m.yaw}-${m.pitch}`}>
              <div className="ed-row">
                {m.kind === 'label' ? (
                  <span className="ed-mark-tag" aria-label="이름표">
                    📍
                  </span>
                ) : (
                  <span className="ed-mark-x" aria-label="출입 제한" />
                )}
                <input
                  className="ed-input"
                  defaultValue={m.title}
                  autoFocus={m.title === '이름 입력'}
                  onFocus={(e) => m.title === '이름 입력' && e.target.select()}
                  placeholder={
                    m.kind === 'label'
                      ? '이름 (예: 우체국, 신한은행, ATM)'
                      : '✕ 아래 보이는 한 줄 (예: 카드키 있는 사람만)'
                  }
                  onBlur={(e) =>
                    e.target.value.trim() !== m.title &&
                    setMarks(
                      marks.map((x, j) => (j === i ? { ...x, title: e.target.value.trim() } : x)),
                      '표시 문구를 고쳤어요'
                    )
                  }
                />
                {/* 이름 → 설명 칸으로 Tab이 바로 가게 지우기 버튼은 Tab 순서에서 뺀다 */}
                <button
                  className="ed-x ed-mark-del"
                  onClick={() =>
                    setMarks(
                      marks.filter((_, j) => j !== i),
                      '표시를 지웠어요'
                    )
                  }
                  aria-label="표시 지우기"
                  tabIndex={-1}
                >
                  ✕
                </button>
              </div>
              <textarea
                className="ed-input"
                rows={2}
                defaultValue={m.desc}
                placeholder={
                  m.kind === 'label'
                    ? '누르면 나오는 설명 (선택 — 예: 평일 9~16시, ATM은 24시간)'
                    : '누르면 나오는 설명 (예: 기숙사생만 카드키로 출입. 방문객은 경비실 문의)'
                }
                onBlur={(e) =>
                  e.target.value.trim() !== m.desc &&
                  setMarks(
                    marks.map((x, j) => (j === i ? { ...x, desc: e.target.value.trim() } : x)),
                    '설명을 고쳤어요'
                  )
                }
              />
              <button
                className={`ed-link ${markFor === i ? 'is-on' : ''}`}
                onClick={() => setMarkFor(markFor === i ? null : i)}
              >
                위치 다시 찍기
              </button>
            </li>
          ))}
        </ul>
        <div className="ed-row ed-gap">
          <button
            className={`ed-btn ${markFor === 'label' ? 'ed-btn-primary' : ''}`}
            onClick={() => setMarkFor(markFor === 'label' ? null : 'label')}
          >
            + 이름표 (우체국·ATM 등)
          </button>
          <button
            className={`ed-btn ${markFor === 'block' ? 'ed-btn-primary' : ''}`}
            onClick={() => setMarkFor(markFor === 'block' ? null : 'block')}
          >
            + 출입 제한 ✕
          </button>
        </div>

        {floorKey && (
          <>
            <label className="ed-label">
              엘리베이터에서 내리면 뜨는 목록{' '}
              <small>
                ({here.floor} · {floorList.length}곳)
              </small>
            </label>
            <ul className="ed-rooms">
              {floorList.map((rm, i) => (
                <li
                  key={`${floorKey}-${i}-${rm.h}-${rm.n}`}
                  {...dropAt('rooms', i, (a, z) =>
                    setFloorList(moved(floorList, a, z), '목록 순서를 바꿨어요')
                  )}
                >
                  <span
                    className="ed-grip"
                    {...grip('rooms', i)}
                    title="끌어서 순서 바꾸기"
                    aria-label="끌어서 순서 바꾸기"
                  >
                    ⠿
                  </span>
                  <input
                    className="ed-input ed-h"
                    defaultValue={rm.h}
                    placeholder="호수"
                    onBlur={(e) =>
                      e.target.value !== rm.h &&
                      setFloorList(
                        floorList.map((x, j) => (j === i ? { ...x, h: e.target.value.trim() } : x)),
                        '목록을 고쳤어요'
                      )
                    }
                  />
                  <input
                    className="ed-input"
                    defaultValue={rm.n}
                    placeholder="이름 (예: 홍길동 교수연구실)"
                    onBlur={(e) =>
                      e.target.value !== rm.n &&
                      setFloorList(
                        floorList.map((x, j) => (j === i ? { ...x, n: e.target.value.trim() } : x)),
                        '목록을 고쳤어요'
                      )
                    }
                  />
                  <button
                    className="ed-x"
                    onClick={() =>
                      setFloorList(
                        floorList.filter((_, j) => j !== i),
                        '목록에서 뺐어요'
                      )
                    }
                    aria-label="빼기"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="ed-row ed-gap">
              <button
                className="ed-btn"
                onClick={() =>
                  setFloorList([...floorList, { h: '', n: '새 항목' }], '목록에 추가했어요')
                }
              >
                + 항목 추가
              </button>
              {snap.edits.floorRooms[floorKey] && (
                <button
                  className="ed-btn"
                  onClick={() => setFloorList(null, '학교 데이터로 되돌렸어요')}
                >
                  학교 데이터로 되돌리기
                </button>
              )}
            </div>
          </>
        )}

        {bFloors.length > 1 && (
          <>
            <label className="ed-label">
              {bName(bHere)} 층 순서{' '}
              <small>(위층부터 · 끌어서 바꾸면 층 버튼·엘리베이터 순서가 바뀌어요)</small>
            </label>
            <ul className="ed-floors">
              {bFloors.map((f, i) => (
                <li
                  key={f}
                  {...dropAt('floors', i, (a, z) =>
                    setFloorOrder(moved(bFloors, a, z), `${bName(bHere)} 층 순서를 바꿨어요`)
                  )}
                >
                  <span
                    className="ed-grip"
                    {...grip('floors', i)}
                    title="끌어서 순서 바꾸기"
                    aria-label="끌어서 순서 바꾸기"
                  >
                    ⠿
                  </span>
                  <b className={f === here.floor ? 'is-here' : ''}>{f}</b>
                </li>
              ))}
            </ul>
            {snap.edits.floorOrder?.[bHere] && (
              <button
                className="ed-btn ed-gap"
                onClick={() => setFloorOrder(null, '층 순서를 숫자 순서로 되돌렸어요')}
              >
                숫자 순서로 되돌리기
              </button>
            )}

            <label className="ed-label">
              {bName(bHere)} 엘리베이터{' '}
              <small>
                (엘리베이터가 여러 대면 나눠서 — 같은 엘리베이터 사진끼리만 층 순서대로 이어져요)
              </small>
            </label>
            {lines.length === 0 && (
              <p className="ed-hint">
                엘리베이터 한 대로 봐요 — 층마다 「이 층 엘리베이터 앞」끼리 이어져요. 여러 대면
                아래에서 나눠 주세요.
              </p>
            )}
            <ul className="ed-lines">
              {lines.map((l, i) => {
                const inLine = l.nodes.includes(here.id);
                return (
                  <li key={i}>
                    <div className="ed-row">
                      <input
                        key={l.name}
                        className="ed-input"
                        defaultValue={l.name}
                        aria-label="엘리베이터 이름"
                        onBlur={(e) =>
                          e.target.value.trim() &&
                          e.target.value.trim() !== l.name &&
                          setLines(
                            lines.map((x, j) =>
                              j === i ? { ...x, name: e.target.value.trim() } : x
                            ),
                            '엘리베이터 이름을 바꿨어요'
                          )
                        }
                      />
                      <button
                        className="ed-x"
                        onClick={() =>
                          setLines(
                            lines.filter((_, j) => j !== i),
                            `「${l.name}」을(를) 지웠어요`
                          )
                        }
                        aria-label="엘리베이터 지우기"
                        title="이 엘리베이터 지우기"
                      >
                        ✕
                      </button>
                    </div>
                    {/* 노선이 서는 층마다 내리면 보이는 사진 */}
                    <ul className="ed-stops">
                      {lineStops(l).map((id) => {
                        const f = NODE_BY_ID.get(id)!.floor!;
                        return (
                          <li key={id} className={id === here.id ? 'is-here' : ''}>
                            <b>{f}</b>
                            <button
                              className="ed-stop-img"
                              onClick={() => setSel(id)}
                              title="이 사진으로 가기"
                            >
                              <img src={thumbUrl(id)} alt="" />
                            </button>
                            <select
                              className="ed-input"
                              value={id}
                              aria-label={`${l.name} ${f} 사진`}
                              onChange={(e) =>
                                setLines(
                                  lines.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          nodes: x.nodes.map((n) =>
                                            n === id ? e.target.value : n
                                          ),
                                        }
                                      : x
                                  ),
                                  `「${l.name}」 ${f}에서 내리는 사진을 바꿨어요`
                                )
                              }
                            >
                              {floorPhotos(f).map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.title}
                                </option>
                              ))}
                            </select>
                            <button
                              className="ed-x"
                              onClick={() => leaveLine(i, id)}
                              aria-label={`${f} 빼기`}
                              title="이 층에 안 서요"
                            >
                              ✕
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <select
                      className="ed-input ed-stop-add"
                      value=""
                      aria-label="서는 층 더하기"
                      onChange={(e) => {
                        const f = e.target.value;
                        const pick =
                          floorPhotos(f).find((n) => floorNodes().get(`${bHere}|${f}`) === n.id) ??
                          floorPhotos(f)[0];
                        if (pick)
                          setLines(
                            lines.map((x, j) =>
                              j === i ? { ...x, nodes: [...x.nodes, pick.id] } : x
                            ),
                            `「${l.name}」이(가) ${f}에도 서요 — 내리는 사진이 맞는지 골라 주세요`
                          );
                      }}
                    >
                      <option value="">+ 서는 층 더하기</option>
                      {bFloors
                        .filter((f) => !l.nodes.some((id) => NODE_BY_ID.get(id)?.floor === f))
                        .map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                    </select>
                    {isFloor(here.floor) &&
                      (inLine ? (
                        <button className="ed-link" onClick={() => leaveLine(i)}>
                          이 사진을 「{l.name}」에서 빼기
                        </button>
                      ) : (
                        <button className="ed-link" onClick={() => joinLine(i)}>
                          + 이 사진을 「{l.name}」 {here.floor}에 넣기
                          {l.nodes.some((id) => NODE_BY_ID.get(id)?.floor === here.floor)
                            ? ' (같은 층 사진과 바꿈)'
                            : ''}
                        </button>
                      ))}
                  </li>
                );
              })}
            </ul>
            <div className="ed-row ed-gap">
              {isFloor(here.floor) && (
                <button
                  className="ed-btn"
                  onClick={() =>
                    setLines(
                      [...lines, { name: `엘베${lines.length + 1}`, nodes: [here.id] }],
                      '새 엘리베이터를 만들었어요 — 다른 층의 그 엘리베이터 앞 사진에서 「넣기」를 눌러 주세요'
                    )
                  }
                >
                  + 새 엘리베이터 (이 사진부터)
                </button>
              )}
              {snap.edits.elevLines?.[bHere] && (
                <button
                  className="ed-btn"
                  onClick={() => setLines(null, '엘리베이터를 처음 값으로 되돌렸어요')}
                >
                  처음 값으로 되돌리기
                </button>
              )}
            </div>
          </>
        )}

        <label className="ed-label">
          여기로 안내하는 곳{' '}
          <small>({herePlaces.length}곳 · "○○ 교수님 연구실로 안내해줘"의 도착 사진)</small>
        </label>
        <ul className="ed-places">
          {herePlaces.map((p) => (
            <li key={p.id}>
              <span>
                <b>{p.name}</b>
                <small>
                  {p.sub}
                  {p.basis === 'editor' ? ' · 지정함' : ''}
                </small>
              </span>
              {p.basis === 'editor' && (
                <button
                  className="ed-x"
                  onClick={() => setPlace(p.id, null)}
                  aria-label="원래대로"
                  title="원래 도착 사진으로"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        <input
          className="ed-input"
          value={placeQ}
          onChange={(e) => setPlaceQ(e.target.value)}
          placeholder="교수님·방 찾아서 이 사진으로 안내 (예: 이지영, 620호)"
        />
        <ul className="ed-add">
          {placeResults.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  setPlace(p.id, here.id);
                  setPlaceQ('');
                }}
              >
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.sub} · 지금 도착: {NODE_BY_ID.get(p.node)?.title ?? p.node}
                  </small>
                </span>
                <em>+ 여기로</em>
              </button>
            </li>
          ))}
        </ul>

        <label className="ed-label">
          이어진 사진 {links.length}개 <small>(사진 속 화살표)</small>
        </label>
        <ul className="ed-links">
          {links.map((l) => (
            <li key={l.to}>
              <button className="ed-link-go" onClick={() => setSel(l.to)} title="이 사진으로 가기">
                <img src={thumbUrl(l.to)} alt="" />
                <span>
                  {NODE_BY_ID.get(l.to)?.hidden && <em className="ed-tag">숨김</em>}
                  {NODE_BY_ID.get(l.to)?.title ?? l.to}
                </span>
              </button>
              <select
                value={l.via}
                onChange={(e) => setLink(l.to, e.target.value as Via)}
                aria-label="이동 방식"
              >
                {VIAS.map((v) => (
                  <option key={v} value={v}>
                    {VIA_LABEL[v]}
                  </option>
                ))}
              </select>
              <button
                className={`ed-yaw ${yawFor === l.to ? 'is-on' : ''}`}
                onClick={() => setYawFor(yawFor === l.to ? null : l.to)}
                title="사진을 클릭해 화살표 방향 맞추기"
              >
                방향
              </button>
              <button
                className="ed-x"
                onClick={() => setLink(l.to, null)}
                aria-label="연결 끊기"
                title="연결 끊기"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <label className="ed-label">사진 잇기</label>
        <div className="ed-row">
          <input
            className="ed-input"
            value={addQ}
            onChange={(e) => setAddQ(e.target.value)}
            placeholder="이을 사진 찾기"
          />
          <select
            className="ed-input ed-via"
            value={addVia}
            onChange={(e) => setAddVia(e.target.value as Via)}
          >
            {VIAS.map((v) => (
              <option key={v} value={v}>
                {VIA_LABEL[v]}
              </option>
            ))}
          </select>
        </div>
        <ul className="ed-add">
          {addResults.map((n) => {
            const cur = linkVia.get(n.id);
            return (
              <li key={n.id}>
                <button
                  onClick={() => {
                    setLink(n.id, addVia);
                    setAddQ('');
                  }}
                  disabled={cur === addVia}
                >
                  <img src={thumbUrl(n.id)} alt="" loading="lazy" />
                  <span>
                    <b>{n.title}</b>
                    <small>
                      {cur ? `이미 ${VIA_LABEL[cur]}(으)로 이어짐 · ` : ''}
                      {FLOOR.get(n.id)?.n ?? n.id}
                    </small>
                  </span>
                  <em>
                    {!cur
                      ? '+ 잇기'
                      : cur === addVia
                        ? '이어져 있음'
                        : `${VIA_LABEL[addVia]}(으)로 바꾸기`}
                  </em>
                </button>
              </li>
            );
          })}
          {addQ.trim() && !addResults.length && (
            <li className="ed-hint">
              찾는 사진이 없어요 — 앱 이름·드라이브 파일명(예: 청운관_L층_중앙) 둘 다로 찾아져요
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

const Eye = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOff = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
  </svg>
);
