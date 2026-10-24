import type { Weather } from '@/api/weatherApi';
import { IconSwap } from '@/components/common/Icons';
import type { Spot } from '@/types';
import type { RouteMode } from '@/utils/graph';

interface Props {
  from: Spot | null;
  to: Spot | null;
  mode: RouteMode;
  onMode: (m: RouteMode) => void;
  /** 캠퍼스 현재 날씨 — 비·눈이면 실내 길 토글에 안내를 띄운다 */
  weather: Weather | null;
  /** 실내·지하 길 우선 */
  indoor: boolean;
  onIndoor: (v: boolean) => void;
  onPickFrom: () => void;
  onPickTo: () => void;
  onSwap: () => void;
  onGo: () => void;
}

const WET_ICON = { rain: '☔', sleet: '🌨️', snow: '❄️' } as const;
const WET_LABEL = { rain: '비가', sleet: '진눈깨비가', snow: '눈이' } as const;

/** 출발·도착 선택, 이동 방식, 실내 길 우선 토글 */
export default function RouteCard({
  from,
  to,
  mode,
  onMode,
  weather,
  indoor,
  onIndoor,
  onPickFrom,
  onPickTo,
  onSwap,
  onGo,
}: Props) {
  const wet = weather?.wet ? weather : null;

  return (
    <section className="card route-card" aria-label="길찾기">
      <div className="route-fields">
        <div className="route-rail" aria-hidden="true">
          <span className="rail-start" />
          <span className="rail-line" />
          <span className="rail-end" />
        </div>
        <div className="route-inputs">
          <button className={`route-field ${from ? '' : 'is-empty'}`} onClick={onPickFrom}>
            <small>출발</small>
            {from?.label ?? '출발지 선택 (NFC 태그 시 자동)'}
          </button>
          <button className={`route-field ${to ? '' : 'is-empty'}`} onClick={onPickTo}>
            <small>도착</small>
            {to?.label ?? '도착지 선택'}
          </button>
        </div>
        <button className="icon-btn swap" onClick={onSwap} aria-label="출발지·도착지 바꾸기">
          <IconSwap />
        </button>
      </div>

      <div className="route-bottom">
        <div className="seg" role="radiogroup" aria-label="이동 방식">
          <button role="radio" aria-checked={mode === 'outdoor'} onClick={() => onMode('outdoor')}>
            야외 경로 우선
          </button>
          <button
            role="radio"
            aria-checked={mode === 'elevator'}
            onClick={() => onMode('elevator')}
          >
            엘리베이터 우선
          </button>
        </div>
        <button className="btn btn-primary" disabled={!from || !to} onClick={onGo}>
          길찾기
        </button>
      </div>

      <button
        className={`indoor-toggle ${wet ? 'is-wet' : ''}`}
        role="switch"
        aria-checked={indoor}
        onClick={() => onIndoor(!indoor)}
      >
        <span className="indoor-icon" aria-hidden>
          {wet ? WET_ICON[wet.kind!] : '☂️'}
        </span>
        <span className="indoor-text">
          <b>
            {wet
              ? `지금 캠퍼스에 ${WET_LABEL[wet.kind!]} 와요${wet.temp != null ? ` · ${Math.round(wet.temp)}°` : ''}`
              : '실내·지하 길 우선'}
          </b>
          <small>
            {indoor
              ? '지붕 있는 실내·지하 길로 먼저 안내해요'
              : wet
                ? '켜면 비를 덜 맞는 길로 안내해요'
                : '비 오는 날엔 자동으로 켜져요'}
          </small>
        </span>
        <span className="switch" aria-hidden />
      </button>
    </section>
  );
}
