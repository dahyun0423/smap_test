import { useState } from 'react';

import type { ReportKind } from '@/api/reportApi';
import { IconFlag, IconList, IconShare, IconSound } from '@/components/common/Icons';
import type { ActiveRoute } from '@/types';
import { SHOW_DOOR_PHOTOS, doorUrl } from '@/utils/rooms';

interface Props {
  node: string;
  route: ActiveRoute;
  /** 지금 지점이 경로의 몇 번째인지 */
  stepIdx: number;
  /** 다음 지점 (도착이면 없음) */
  next?: string;
  arrived: boolean;
  /** 지금 단계 안내 문구 */
  text: string;
  /** 이 구간의 보충 설명 */
  note?: string;
  muted: boolean;
  onToggleMute: () => void;
  onShowSteps: () => void;
  onShare: () => void;
  onNavigate: (node: string) => void;
  onExit: () => void;
  onReport: (node: string, step?: number, kind?: ReportKind) => void;
  onPraise: (node: string) => void;
}

/** 길안내 중 하단 카드 — 단계 진행·안내 문구·이전/다음, 도착하면 평가 */
export default function StepCard({
  node,
  route,
  stepIdx,
  next,
  arrived,
  text,
  note,
  muted,
  onToggleMute,
  onShowSteps,
  onShare,
  onNavigate,
  onExit,
  onReport,
  onPraise,
}: Props) {
  // '정확했어요'를 누른 도착지 (같은 도착지에서 한 번만)
  const [praised, setPraised] = useState<string | null>(null);
  const last = route.path.length - 1;
  const dest = route.to;

  return (
    <section className={`step-card ${arrived ? 'is-arrived' : ''}`} aria-live="polite">
      <div className="step-meta">
        <span className="step-count">{arrived ? '도착' : `${stepIdx + 1} / ${last}단계`}</span>
        <span className="step-dest">→ {dest.label}</span>
        <div className="step-tools">
          <button
            className="icon-btn"
            onClick={onToggleMute}
            aria-label={muted ? '음성 안내 켜기' : '음성 안내 끄기'}
          >
            <IconSound off={muted} />
          </button>
          <button className="icon-btn" onClick={onShowSteps} aria-label="전체 단계 보기">
            <IconList />
          </button>
          <button className="icon-btn" onClick={onShare} aria-label="경로 공유">
            <IconShare />
          </button>
        </div>
      </div>
      <div className="step-progress">
        <span style={{ width: `${(Math.max(stepIdx, 0) / Math.max(last, 1)) * 100}%` }} />
      </div>

      {arrived ? (
        <>
          <p className="step-text">{dest.label}에 도착했어요</p>
          {dest.place?.sub && <p className="step-note">{dest.place.sub}</p>}
          {SHOW_DOOR_PHOTOS && dest.place?.photo && (
            <figure className="step-photo">
              <img src={doorUrl(dest.place.photo)} alt={`${dest.label} 문 앞`} />
              <figcaption>이 문을 찾으세요 · 현장 사진</figcaption>
            </figure>
          )}
          {dest.place?.sample && (
            <p className="step-warn">예시 데이터예요 — 실제 위치는 확인이 필요해요.</p>
          )}
          <div className="step-rate">
            <span>안내가 정확했나요?</span>
            {praised === dest.node ? (
              <b>고마워요! 👍</b>
            ) : (
              <>
                <button
                  className="chip"
                  onClick={() => {
                    setPraised(dest.node);
                    onPraise(dest.node);
                  }}
                >
                  👍 정확했어요
                </button>
                <button className="chip" onClick={() => onReport(node, stepIdx, 'issue')}>
                  헷갈렸어요
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="step-text">{text}</p>
          {note && <p className="step-note">{note}</p>}
          <p className="step-hint">
            사진 속 <span className="hint-dot" /> 파랗게 빛나는 화살표를 누르거나 ‘다음’을 누르세요
          </p>
        </>
      )}

      <div className="step-actions">
        <button
          className="btn btn-ghost"
          disabled={stepIdx <= 0}
          onClick={() => onNavigate(route.path[stepIdx - 1])}
        >
          이전
        </button>
        {arrived ? (
          <button className="btn btn-primary" onClick={onExit}>
            안내 종료
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => next && onNavigate(next)}>
            다음
          </button>
        )}
        <button
          className="icon-btn report"
          onClick={() => onReport(node, stepIdx)}
          aria-label="제보하기 (헷갈려요·못 가요)"
        >
          <IconFlag />
        </button>
      </div>
    </section>
  );
}
