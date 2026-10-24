import { useEffect, useRef, useState } from 'react';

import { IconBack, IconDot, IconMic, IconPin } from '@/components/common/Icons';
import CampusMap from '@/components/map/CampusMap';
import { type Level, NODE_BY_ID, PLACES, type Place } from '@/data/campus';
import type { Spot } from '@/types';
import { LOCATE_ERROR, locate } from '@/utils/location';
import { searchNodes, searchPlaces } from '@/utils/search';
import { placeToSpot } from '@/utils/spot';

const KIND_LABEL: Record<Place['kind'], string> = {
  building: '건물',
  facility: '시설',
  office: '부서',
  professor: '교수 연구실',
  room: '호실',
};

// 검색어가 없을 때 보여주는 '자주 찾는 곳' (PLACES id)
const POPULAR_IDS = [
  'f-bus',
  'b-bonkwan',
  'b-yudam',
  'f-cafeteria',
  'f-gate',
  'b-bukak',
  'f-parking1',
  'b-hyein',
];

interface Props {
  title: string;
  placeholder?: string;
  onPick: (s: Spot) => void;
  onClose: () => void;
  onVoice?: () => void;
  /** 출발지 고를 때: 360 지점 이름까지 검색 */
  withNodes?: boolean;
}

/** 출발지·도착지 검색 화면. 출발지를 고를 땐 현재 위치·지도 선택도 제공한다 */
export default function PlacePicker({
  title,
  placeholder,
  onPick,
  onClose,
  onVoice,
  withNodes,
}: Props) {
  const [q, setQ] = useState('');
  const [finding, setFinding] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [level, setLevel] = useState<Level>('ground');
  const findMe = async () => {
    setFinding(true);
    setLocErr(null);
    const r = await locate();
    setFinding(false);
    if ('spot' in r) onPick(r.spot);
    else setLocErr(LOCATE_ERROR[r.error]);
  };
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const results = searchPlaces(q, 12);
  const nodes = withNodes ? searchNodes(q, 6) : [];
  const popular = PLACES.filter((p) => POPULAR_IDS.includes(p.id));

  return (
    <div className="screen picker" role="dialog" aria-label={title}>
      <div className="picker-head">
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          <IconBack />
        </button>
        <div className="search-field">
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder ?? '건물, 부서, 교수님 이름'}
            enterKeyHint="search"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) onPick(placeToSpot(results[0]));
            }}
          />
          {onVoice && (
            <button className="icon-btn mic-mini" onClick={onVoice} aria-label="음성으로 검색">
              <IconMic size={20} />
            </button>
          )}
        </div>
      </div>
      <p className="picker-title">{title}</p>

      {!q && withNodes && (
        <ul className="result-list here-list">
          <li>
            <button className="result" onClick={findMe} disabled={finding}>
              <span className="result-icon is-here">
                <IconDot />
              </span>
              <span className="result-main">
                <b>{finding ? '위치 찾는 중…' : '현재 위치로'}</b>
                <small>가장 가까운 촬영 지점 · 실내에선 부정확할 수 있어요</small>
              </span>
            </button>
          </li>
          {locErr && (
            <li className="here-error" role="alert">
              {locErr}
            </li>
          )}
          <li>
            <button
              className="result"
              onClick={() => setMapOpen((v) => !v)}
              aria-expanded={mapOpen}
            >
              <span className="result-icon is-node">
                <IconPin />
              </span>
              <span className="result-main">
                <b>지도에서 고르기</b>
                <small>지도를 누르면 가장 가까운 촬영 지점</small>
              </span>
            </button>
          </li>
          {mapOpen && (
            <li className="here-map">
              <CampusMap
                level={level}
                onLevel={setLevel}
                onPick={(n) => onPick({ node: n, label: NODE_BY_ID.get(n)!.title })}
              />
            </li>
          )}
        </ul>
      )}
      {!q && (
        <>
          <p className="list-caption">자주 찾는 곳</p>
          <ul className="result-list">
            {popular.map((p) => (
              <ResultRow key={p.id} p={p} onPick={onPick} />
            ))}
          </ul>
        </>
      )}
      {q && (
        <ul className="result-list">
          {results.map((p) => (
            <ResultRow key={p.id} p={p} onPick={onPick} />
          ))}
          {nodes.map((n) => (
            <li key={n.id}>
              <button className="result" onClick={() => onPick({ node: n.id, label: n.title })}>
                <span className="result-icon is-node">
                  <IconDot />
                </span>
                <span className="result-main">
                  <b>{n.title}</b>
                  <small>360 촬영 지점</small>
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && nodes.length === 0 && (
            <li className="empty">
              ‘{q}’ 검색 결과가 없어요. 건물 이름이나 부서 이름으로 다시 찾아보세요.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function ResultRow({ p, onPick }: { p: Place; onPick: (s: Spot) => void }) {
  return (
    <li>
      <button className="result" onClick={() => onPick(placeToSpot(p))}>
        <span className="result-icon">
          <IconPin />
        </span>
        <span className="result-main">
          <b>{p.name}</b>
          <small>
            {KIND_LABEL[p.kind]}
            {p.sub ? ` · ${p.sub}` : ''}
          </small>
        </span>
        {p.sample && <span className="tag-sample">예시</span>}
      </button>
    </li>
  );
}
