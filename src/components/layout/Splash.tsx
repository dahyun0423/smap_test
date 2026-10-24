import { useEffect } from 'react';

import splashRoad from '../../../public/ui/splash-road.svg?raw';

interface Props {
  /** NFC 태그로 들어왔을 때 태그가 붙은 곳 (출발지) */
  nfcPlace?: string;
  onDone: () => void;
}

// 앱 시작 화면. S자 길 SVG를 애니메이션(styles/index.css .splash)으로 그린다.
// NFC로 들어오면 출발지 안내를 함께 보여주고 조금 더 머문다. 화면을 누르면 바로 닫힌다.
export default function Splash({ nfcPlace, onDone }: Props) {
  const ms = nfcPlace ? 2800 : 2200;
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(onDone, reduce ? 1000 : ms);
    return () => clearTimeout(t);
  }, [onDone, ms]);
  return (
    <div
      className="splash"
      style={{ animationDelay: `${ms - 350}ms` }}
      role="status"
      onClick={onDone}
      aria-label={nfcPlace ? `지금 계신 ${nfcPlace}에서 시작할게요` : 'SMAP 서경대 캠퍼스 길찾기'}
    >
      <div
        className="splash-road"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: splashRoad }}
      />
      <div className="splash-text">
        <b aria-hidden="true">
          {'smap'.split('').map((c, i) => (
            <span key={i} style={{ animationDelay: `${800 + i * 70}ms` }}>
              {c}
            </span>
          ))}
        </b>
        {nfcPlace ? (
          <p>
            <i>NFC 태그</i>
            <br />
            지금 계신 <em>{nfcPlace}</em>에서
            <br />
            시작할게요
          </p>
        ) : (
          <p className="splash-tag">서경대 캠퍼스 길찾기</p>
        )}
      </div>
    </div>
  );
}
