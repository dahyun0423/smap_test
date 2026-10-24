import { useState } from 'react';

import type { Closure } from '@/api/reportApi';
import type { Weather } from '@/api/weatherApi';
import { IconSearch } from '@/components/common/Icons';
import { FAC_ICON } from '@/components/common/MapIcons';
import BuildingSheet from '@/components/home/BuildingSheet';
import ClosureCard from '@/components/home/ClosureCard';
import FacilitySheet from '@/components/home/FacilitySheet';
import RouteCard from '@/components/home/RouteCard';
import TabBar from '@/components/layout/TabBar';
import CampusMap from '@/components/map/CampusMap';
import {
  BUILDING_BY_ID,
  type BuildingId,
  type Level,
  NODE_BY_ID,
  PLACES,
  type Place,
} from '@/data/campus';
import type { Spot } from '@/types';
import { FAC_CATS, type FacCat, facilitySpots } from '@/utils/facilities';
import type { RouteMode } from '@/utils/graph';
import { placeToSpot } from '@/utils/spot';

interface Props {
  from: Spot | null;
  to: Spot | null;
  mode: RouteMode;
  onMode: (m: RouteMode) => void;
  weather: Weather | null;
  indoor: boolean;
  onIndoor: (v: boolean) => void;
  onPickFrom: () => void;
  onPickTo: () => void;
  onSwap: () => void;
  onGo: () => void;
  onSearch: () => void;
  onVoice: () => void;
  onReport: () => void;
  /** 지금 못 가는 곳 */
  closures: Closure[];
  onExplore: (node: string) => void;
  /** 하단 지도 탭 — 현재 위치에서 거리뷰 둘러보기 */
  onMapTab: () => void;
  onSetFrom: (s: Spot) => void;
  onSetTo: (s: Spot) => void;
}

// 자주 찾는 곳 [장소 id, 칩 문구]
const QUICK: [string, string][] = [
  ['b-bonkwan', '본관'],
  ['r-yudam-303', '골프장'],
  ['b-suin', '수인관'],
  ['b-chungwoon', '청운관'],
];

/** 편의시설 핀 문구 — '건물 시설명' (같은 지점에 여럿이면 '외 n') */
const pinLabel = (node: string, places: Place[]) => {
  const building = BUILDING_BY_ID.get(NODE_BY_ID.get(node)!.building)?.name;
  const first = places[0].name.replace(/ \(.+\)$/, '');
  const more = places.length > 1 ? ` 외 ${places.length - 1}` : '';
  return `${building ? `${building} ` : ''}${first}${more}`;
};

export default function Home(p: Props) {
  const [level, setLevel] = useState<Level>('ground');
  const [building, setBuilding] = useState<BuildingId | null>(null);
  const [fac, setFac] = useState<FacCat | null>(null);
  const [facSheet, setFacSheet] = useState<Place[] | null>(null);

  // 편의시설 필터를 고르면 건물 핀 대신 시설 핀을 띄운다
  const spots = fac ? facilitySpots(fac) : [];
  const hiddenOther = spots.filter(
    (s) => (NODE_BY_ID.get(s.node)?.level ?? 'ground') !== level
  ).length;
  const markers = fac
    ? spots.map((s) => ({
        node: s.node,
        label: pinLabel(s.node, s.places),
        icon: FAC_ICON[fac],
        onClick: () =>
          s.places.length > 1 ? setFacSheet(s.places) : p.onSetTo(placeToSpot(s.places[0])),
      }))
    : undefined;
  const otherLevel = level === 'ground' ? '지하' : '지상';

  return (
    <div className="screen">
      <div className="home">
        <div className="hero">
          <div className="hero-bg" aria-hidden="true" />
          <h1>어디로 갈까요?</h1>
          <button className="searchbar" onClick={p.onSearch}>
            <IconSearch />
            <span>건물, 부서, 교수님 연구실 검색</span>
          </button>
          <RouteCard
            from={p.from}
            to={p.to}
            mode={p.mode}
            onMode={p.onMode}
            weather={p.weather}
            indoor={p.indoor}
            onIndoor={p.onIndoor}
            onPickFrom={p.onPickFrom}
            onPickTo={p.onPickTo}
            onSwap={p.onSwap}
            onGo={p.onGo}
          />
        </div>

        {p.closures.length > 0 && <ClosureCard closures={p.closures} />}

        <div className="quick" role="list" aria-label="자주 찾는 곳">
          {QUICK.map(([id, label]) => {
            const place = PLACES.find((x) => x.id === id);
            return (
              place && (
                <button
                  role="listitem"
                  key={id}
                  className="chip"
                  onClick={() => p.onSetTo(placeToSpot(place))}
                >
                  {label}
                </button>
              )
            );
          })}
        </div>

        <section className="card map-card">
          <div className="card-head">
            <h2>캠퍼스 지도</h2>
            <span className="card-sub">
              {fac ? '편의시설 핀을 눌러보세요' : '건물을 눌러보세요'}
            </span>
          </div>
          <div className="fac-chips" role="radiogroup" aria-label="편의시설 보기">
            <button className="chip" role="radio" aria-checked={!fac} onClick={() => setFac(null)}>
              {FAC_ICON.building}건물
            </button>
            {FAC_CATS.map((c) => (
              <button
                key={c.id}
                className="chip"
                role="radio"
                aria-checked={fac === c.id}
                onClick={() => setFac(c.id)}
              >
                {FAC_ICON[c.id]}
                {c.label}
              </button>
            ))}
          </div>
          <CampusMap level={level} onLevel={setLevel} onBuilding={setBuilding} markers={markers} />
          {fac && hiddenOther > 0 && (
            <p className="map-note">
              {otherLevel}에 {hiddenOther}곳 더 있어요 — 오른쪽 위 {otherLevel} 버튼
            </p>
          )}
          {fac && <p className="map-note">핀을 누르면 그곳으로 길찾기를 시작해요.</p>}
          {!fac && level === 'underground' && (
            <p className="map-note">
              지하 제1주차장은 본관·북악관·한림관·문예관·대일관·상승관·청운관·혜인관·은주1·2관과
              이어져요.
            </p>
          )}
        </section>
      </div>

      <TabBar onMap={p.onMapTab} onVoice={p.onVoice} onReport={p.onReport} />

      {facSheet && (
        <FacilitySheet
          places={facSheet}
          onPick={(x) => {
            p.onSetTo(placeToSpot(x));
            setFacSheet(null);
          }}
          onClose={() => setFacSheet(null)}
        />
      )}

      {building && (
        <BuildingSheet
          building={building}
          onClose={() => setBuilding(null)}
          onExplore={p.onExplore}
          onSetFrom={(x) => p.onSetFrom(placeToSpot(x))}
          onSetTo={(x) => p.onSetTo(placeToSpot(x))}
        />
      )}
    </div>
  );
}
