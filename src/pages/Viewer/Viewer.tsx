import { useEffect, useMemo, useState } from 'react';

import type { ReportKind } from '@/api/reportApi';
import { IconBack, IconFlag, IconMap } from '@/components/common/Icons';
import CampusMap from '@/components/map/CampusMap';
import FloorBar from '@/components/viewer/FloorBar';
import FloorSheet from '@/components/viewer/FloorSheet';
import PanoViewer, { type ViewLink } from '@/components/viewer/PanoViewer';
import RoomOverlay from '@/components/viewer/RoomOverlay';
import StepCard from '@/components/viewer/StepCard';
import StepsSheet from '@/components/viewer/StepsSheet';
import YawEditPanel from '@/components/viewer/YawEditPanel';
import { NODE_BY_ID } from '@/data/campus';
import type { ActiveRoute } from '@/types';
import {
  VIA_LABEL,
  edgeBetween,
  elevatorLinkTo,
  instruction,
  linkYaw,
  linksOf,
  loadLocalYaw,
  placeLabel,
  saveLocalYaw,
} from '@/utils/graph';
import { marksOf } from '@/utils/marks';
import { floorsOf, roomsOnFloor } from '@/utils/rooms';
import { isMuted, setMuted, speak } from '@/utils/speech';

interface Props {
  node: string;
  /** 길안내 중이면 경로, 둘러보기면 null */
  route: ActiveRoute | null;
  /** 화살표 방향 보정 모드 (?edit=1) */
  editMode: boolean;
  onNavigate: (node: string) => void;
  onExit: () => void;
  onRouteFromHere: (node: string) => void;
  onShare: () => void;
  toast: (msg: string) => void;
  /** 서버 보정값이 도착하면 바뀌는 값 — 화살표를 다시 그린다 */
  yawRev?: number;
  canSaveRemote?: boolean;
  onReport: (node: string, step?: number, kind?: ReportKind) => void;
  onPraise: (node: string) => void;
}

/** 360 거리뷰 화면 — 길안내(단계별 카드) 또는 자유 둘러보기 */
export default function Viewer({
  node,
  route,
  editMode,
  onNavigate,
  onExit,
  onRouteFromHere,
  onShare,
  toast,
  yawRev = 0,
  canSaveRemote,
  onReport,
  onPraise,
}: Props) {
  const here = NODE_BY_ID.get(node)!;
  const [showMap, setShowMap] = useState(true);
  const [showSteps, setShowSteps] = useState(false);
  const [showFloor, setShowFloor] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [localYaw, setLocalYaw] = useState(loadLocalYaw);
  // 방향을 맞추는 중인 연결 — 다른 지점으로 이동하면 자동으로 풀린다
  const [editing, setEditing] = useState<{ at: string; to: string } | null>(null);
  const editingTo = editing?.at === node ? editing.to : null;
  const setEditingTo = (to: string | null) => setEditing(to ? { at: node, to } : null);

  const stepIdx = route ? route.path.indexOf(node) : -1;
  const last = route ? route.path.length - 1 : 0;
  const next = route && stepIdx >= 0 && stepIdx < last ? route.path[stepIdx + 1] : undefined;
  const arrived = !!route && stepIdx === last;
  const text = route
    ? arrived
      ? `도착했어요. ${route.to.label}입니다.`
      : next
        ? instruction(node, next)
        : ''
    : '';

  useEffect(() => {
    if (route && text) speak(text);
  }, [node, route, text]);

  const links: ViewLink[] = useMemo(() => {
    // 다음 단계가 엘리베이터로 여러 층 떨어져 있으면, 엘리베이터 화살표가 그 층으로 바로 가게
    const elev = next ? elevatorLinkTo(node, next) : undefined;
    return linksOf(node).map((l) => {
      const to = l === elev ? next! : l.to;
      const t = NODE_BY_ID.get(to)!;
      const viaFloor = l.via === 'elevator' || l.via === 'stairs' ? ` → ${t.floor ?? ''}` : '';
      return {
        to,
        yaw: linkYaw(node, l.to, localYaw),
        label: l === elev ? `엘리베이터 → ${t.floor ?? ''}` : t.title,
        sub: l === elev ? t.title : l.via === 'walk' ? undefined : VIA_LABEL[l.via] + viaFloor,
        primary: to === next,
        editing: l.to === editingTo,
      };
    });
  }, [node, next, localYaw, editingTo, yawRev]); // eslint-disable-line react-hooks/exhaustive-deps

  // 보정 모드에서 길을 고른 상태면, 사진을 탭한 방향을 저장한다
  const pickYaw =
    editMode && editingTo
      ? (deg: number) => {
          const v = { ...localYaw, [`${node}>${editingTo}`]: deg };
          setLocalYaw(v);
          saveLocalYaw(v);
          setEditingTo(null);
          toast(`방향 저장: ${NODE_BY_ID.get(editingTo)?.title} = ${deg}°`);
        }
      : undefined;

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted && text) speak(text);
  };

  const level = here.level ?? 'ground';
  const indoorFloor = here.building !== 'outdoor' && here.floor ? here.floor : null;
  const floors = useMemo(
    () => (here.building !== 'outdoor' ? floorsOf(here.building) : []),
    [here.building]
  );
  const floorRooms = useMemo(
    () => (indoorFloor ? roomsOnFloor(here.building, indoorFloor).length : 0),
    [here.building, indoorFloor]
  );
  const note = next ? edgeBetween(node, next)?.note : undefined;
  // 층 대표 지점에서는 방 목록을 바로 띄운다 (편집기에서 지점마다 켜고 끌 수 있음)
  const showRooms = !!indoorFloor && floorRooms > 0 && (here.roomList ?? !!here.center);

  return (
    <div className="screen viewer">
      <PanoViewer
        node={here}
        links={links}
        onNavigate={onNavigate}
        onPickYaw={pickYaw}
        marks={marksOf(here.id)}
      />

      <header className="viewer-top">
        <button className="icon-btn glass" onClick={onExit} aria-label="홈으로">
          <IconBack />
        </button>
        <div className="where glass">
          <span className="where-place">{placeLabel(here) || '야외'}</span>
          <b className="where-title">{here.title}</b>
          {here.estimated && <span className="where-est">위치 추정</span>}
        </div>
        <button
          className={`icon-btn glass ${showMap ? 'is-on' : ''}`}
          onClick={() => setShowMap((v) => !v)}
          aria-label="미니맵"
          aria-pressed={showMap}
        >
          <IconMap />
        </button>
      </header>

      {showRooms && (
        <RoomOverlay
          key={`${here.building}|${indoorFloor}`}
          building={here.building}
          floor={indoorFloor!}
        />
      )}

      {indoorFloor && (
        <button className="floor-chip glass" onClick={() => setShowFloor(true)}>
          🚪 이 층의 방{floorRooms ? ` ${floorRooms}곳` : ''}
        </button>
      )}

      {showMap && (
        <div className="viewer-map">
          <CampusMap
            level={level}
            compact
            route={route?.path}
            current={node}
            target={route?.to.node}
          />
          <span className="viewer-map-level">{level === 'ground' ? '지상' : '지하'}</span>
        </div>
      )}

      {editMode && (
        <YawEditPanel
          node={node}
          localYaw={localYaw}
          editingTo={editingTo}
          onEdit={setEditingTo}
          canSaveRemote={canSaveRemote}
          toast={toast}
        />
      )}

      {floors.length > 1 && <FloorBar here={here} floors={floors} onNavigate={onNavigate} />}

      <div className="viewer-bottom">
        {route ? (
          <StepCard
            node={node}
            route={route}
            stepIdx={stepIdx}
            next={next}
            arrived={arrived}
            text={text}
            note={note}
            muted={muted}
            onToggleMute={toggleMute}
            onShowSteps={() => setShowSteps(true)}
            onShare={onShare}
            onNavigate={onNavigate}
            onExit={onExit}
            onReport={onReport}
            onPraise={onPraise}
          />
        ) : (
          <section className="explore-card">
            <div>
              <p className="explore-sub">거리뷰 둘러보기 · 사진 속 화살표로 이동</p>
              <b>{here.title}</b>
            </div>
            <div className="explore-actions">
              <button className="btn btn-primary" onClick={() => onRouteFromHere(node)}>
                여기서 출발
              </button>
              <button
                className="icon-btn report"
                onClick={() => onReport(node)}
                aria-label="제보하기"
              >
                <IconFlag />
              </button>
            </div>
          </section>
        )}
      </div>

      {showFloor && indoorFloor && (
        <FloorSheet
          building={here.building}
          floor={indoorFloor}
          onClose={() => setShowFloor(false)}
        />
      )}

      {showSteps && route && (
        <StepsSheet
          route={route}
          stepIdx={stepIdx}
          onNavigate={onNavigate}
          onClose={() => setShowSteps(false)}
        />
      )}
    </div>
  );
}
