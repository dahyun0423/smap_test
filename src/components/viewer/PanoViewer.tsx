import { useEffect, useRef, useState } from 'react';

import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import { type MarkerConfig, MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/markers-plugin/index.css';

import { type PanoNode, panoUrl } from '@/data/campus';
import type { Mark } from '@/data/edits';

export interface ViewLink {
  to: string;
  /** 사진 속 방향 (도, 정면 0) */
  yaw: number;
  label: string;
  sub?: string;
  /** 경로 안내 중 다음으로 가야 할 길 */
  primary?: boolean;
  /** 방향 보정 중인 링크 */
  editing?: boolean;
}

interface Props {
  node: PanoNode;
  links: ViewLink[];
  onNavigate: (to: string) => void;
  /** 보정 모드: 사진을 탭한 방향(도)과 높이(도)를 돌려준다 */
  onPickYaw?: (yawDeg: number, pitchDeg: number) => void;
  /** 사진 위 표시 (이름표·출입 제한 ✕) — 누르면 설명 */
  marks?: (Mark & { editing?: boolean })[];
}

// 360 뷰어 (Photo Sphere Viewer). 이동 화살표·표시는 MarkersPlugin의 HTML 마커로 그린다

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function markerHtml(l: ViewLink) {
  const cls = ['pv-link', l.primary && 'is-primary', l.editing && 'is-editing']
    .filter(Boolean)
    .join(' ');
  return `<div class="${cls}"><span class="pv-arrow" aria-hidden="true"><i></i><i></i><i></i></span><span class="pv-label">${esc(l.label)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</span></div>`;
}

function markHtml(m: Mark & { editing?: boolean }) {
  if (m.kind === 'label')
    return `<div class="pv-tag${m.editing ? ' is-editing' : ''}"><span class="pv-tag-name">${esc(m.title)}${m.desc ? '<i aria-hidden="true">i</i>' : ''}</span><span class="pv-tag-pin" aria-hidden="true"></span></div>`;
  return `<div class="pv-mark${m.editing ? ' is-editing' : ''}"><span class="pv-mark-x" aria-hidden="true"></span><span class="pv-mark-label">${esc(m.title)}</span></div>`;
}

const NO_MARKS: Mark[] = [];

export default function PanoViewer({
  node,
  links,
  onNavigate,
  onPickYaw,
  marks = NO_MARKS,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const markers = useRef<MarkersPlugin | null>(null);
  const [loading, setLoading] = useState(true);
  const nav = useRef(onNavigate);
  const pick = useRef(onPickYaw);
  useEffect(() => {
    nav.current = onNavigate;
    pick.current = onPickYaw;
  }, [onNavigate, onPickYaw]);

  // 지점이 바뀌면 사진 교체 — 다음 길 방향을 바라보며 시작한다.
  // 뷰어는 첫 사진과 함께 생성한다 (생성 직후 setPanorama를 부르면 초기화에 덮여 멈춘다).
  const primaryYaw = links.find((l) => l.primary)?.yaw;
  useEffect(() => {
    if (node.flat || !box.current) return;
    const position = { yaw: `${primaryYaw ?? 0}deg`, pitch: '-5deg' };
    setLoading(true);
    const v = viewer.current;
    if (!v) {
      const nv = new Viewer({
        container: box.current,
        panorama: panoUrl(node.id),
        defaultYaw: position.yaw,
        defaultPitch: position.pitch,
        navbar: false,
        defaultZoomLvl: 20,
        touchmoveTwoFingers: false,
        mousewheelCtrlKey: false,
        loadingTxt: '',
        plugins: [[MarkersPlugin, {}]],
      });
      const m = nv.getPlugin<MarkersPlugin>(MarkersPlugin);
      m.addEventListener('select-marker', ({ marker }) => {
        const to = (marker.data as { to?: string } | undefined)?.to;
        if (to) nav.current(to);
      });
      nv.addEventListener('click', ({ data }) => {
        if (pick.current && !data.rightclick)
          pick.current(
            Math.round((data.yaw * 180) / Math.PI),
            Math.round((data.pitch * 180) / Math.PI)
          );
      });
      nv.addEventListener('ready', () => setLoading(false), { once: true });
      viewer.current = nv;
      if (import.meta.env.DEV) (window as unknown as { __psv: Viewer }).__psv = nv;
      markers.current = m;
      return;
    }
    markers.current?.clearMarkers();
    v.setPanorama(panoUrl(node.id), {
      transition: { speed: 700, rotation: false, effect: 'fade' },
      position,
      showLoader: false,
    })
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  useEffect(
    () => () => {
      viewer.current?.destroy();
      viewer.current = null;
      markers.current = null;
    },
    []
  );

  // 이동 화살표 + 사진 위 표시 갱신
  useEffect(() => {
    const m = markers.current;
    if (!m || node.flat) return;
    // 같은 곳으로 가는 길이 두 개면 화살표는 하나만 (마커 id 중복 방지)
    const uniq = links.filter((l, i) => links.findIndex((x) => x.to === l.to) === i);
    m.setMarkers(
      uniq
        .map((l): MarkerConfig => ({
          id: `link-${l.to}`,
          // 바닥에 깔린 느낌이 나도록 시선보다 아래
          position: { yaw: `${l.yaw}deg`, pitch: '-17deg' },
          html: markerHtml(l),
          anchor: 'center center',
          data: { to: l.to },
          zIndex: l.primary ? 20 : 10,
        }))
        .concat(
          marks.map((k, i): MarkerConfig => ({
            id: `mark-${i}`,
            position: { yaw: `${k.yaw}deg`, pitch: `${k.pitch}deg` },
            html: markHtml(k),
            // 이름표는 핀 끝이 그 위치를 가리키도록
            anchor: k.kind === 'label' ? 'bottom center' : 'center center',
            // 모바일엔 hover가 없어 click으로 설명 표시
            tooltip: k.desc
              ? {
                  content: esc(k.desc),
                  position: 'bottom center',
                  trigger: 'click',
                  className: 'pv-mark-tip',
                }
              : undefined,
            zIndex: k.kind === 'label' ? 15 : 5,
          }))
        )
    );
  }, [links, marks, node.flat, loading]);

  return (
    <div className="pano">
      <div
        ref={box}
        className="pano-canvas"
        style={{ visibility: node.flat ? 'hidden' : 'visible' }}
      />
      {node.flat && (
        <div className="pano-flat">
          <img src={panoUrl(node.id)} alt={node.title} />
          <p className="pano-flat-note">이 지점은 일반 사진이에요 (360 재촬영 필요)</p>
          <div className="pano-flat-links">
            {links.map((l) => (
              <button
                key={l.to}
                className={`chip ${l.primary ? 'chip-primary' : ''}`}
                onClick={() => onNavigate(l.to)}
              >
                {l.primary ? '다음 → ' : ''}
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {loading && !node.flat && (
        <div className="pano-loading">
          <span className="spinner" />
          사진 불러오는 중
        </div>
      )}
    </div>
  );
}
