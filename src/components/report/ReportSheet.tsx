import { useState } from 'react';

import type { Features } from '@/api/client';
import { type ReportKind, sendReport, uploadPhoto } from '@/api/reportApi';
import { IconBack } from '@/components/common/Icons';
import CampusMap from '@/components/map/CampusMap';
import PlacePicker from '@/components/search/PlacePicker';
import {
  CLOSURE_TYPES,
  COURSE_TAGS,
  DURATIONS,
  HOME_NODE,
  ISSUE_TYPES,
  KIND_INFO,
  MEMO_HINT,
} from '@/constants/report';
import { type Level, NODE_BY_ID } from '@/data/campus';
import type { Spot } from '@/types';
import { saveLocalReport, untilDate } from '@/utils/reportStorage';

interface Props {
  /** 거리뷰에서 열면 그 지점, 홈에서 열면 없음 */
  node?: string;
  step?: number;
  /** 바로 이 종류로 시작 (없으면 종류 고르기부터) */
  kind?: ReportKind;
  /** 홈에서 열 때 위치 기본값 — 지금 출발지 */
  near?: Spot | null;
  features: Features;
  onClose: () => void;
  onSent: (msg: string) => void;
  onOpenMine: () => void;
}

type Picking = null | 'loc' | 'from' | 'to';

/** 제보 시트 — 종류 선택 → 위치·내용·사진 → 전송. 전송에 실패하면 이 기기에만 저장한다 */
export default function ReportSheet({
  node,
  step,
  kind: fixedKind,
  near,
  features,
  onClose,
  onSent,
  onOpenMine,
}: Props) {
  const startLoc: Spot | null = node
    ? { node, label: NODE_BY_ID.get(node)?.title ?? node }
    : (near ?? null);
  const [kind, setKind] = useState<ReportKind | null>(fixedKind ?? null);
  const [loc, setLoc] = useState<Spot | null>(startLoc);
  const [from, setFrom] = useState<Spot | null>(near ?? null);
  const [to, setTo] = useState<Spot | null>(null);
  const [picking, setPicking] = useState<Picking>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [level, setLevel] = useState<Level>(
    () => (startLoc && NODE_BY_ID.get(startLoc.node)?.level) || 'ground'
  );
  const [type, setType] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(0);
  const [tags, setTags] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // 종류별 필수 입력이 채워졌는지
  const ready =
    kind === 'issue'
      ? !!(type || memo.trim())
      : kind === 'closure'
        ? !!(loc && type)
        : kind === 'course'
          ? !!(from && to && from.node !== to.node && (memo.trim() || tags.length))
          : kind === 'praise'
            ? !!loc
            : false;

  const pickPhoto = (f: File | undefined) => {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(f ?? null);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const send = async () => {
    if (!kind) return;
    setSending(true);
    const path = photo && features.photo ? await uploadPhoto(photo) : undefined;
    const report = {
      kind,
      node: kind === 'course' ? from!.node : (loc?.node ?? HOME_NODE),
      step,
      type:
        kind === 'closure' || kind === 'issue'
          ? type
          : kind === 'course'
            ? tags.join(', ') || null
            : null,
      memo: memo.trim(),
      until: kind === 'closure' ? untilDate(days) : undefined,
      fromNode: kind === 'course' ? from!.node : undefined,
      toNode: kind === 'course' ? to!.node : undefined,
      tags: kind === 'course' ? tags : undefined,
      photo: path ?? undefined,
    };
    const ok = await sendReport(report);
    if (!ok) saveLocalReport(report);
    setSending(false);
    onSent(KIND_INFO[kind].thanks);
  };

  const onPicked = (s: Spot) => {
    if (picking === 'loc') setLoc(s);
    if (picking === 'from') setFrom(s);
    if (picking === 'to') setTo(s);
    setPicking(null);
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}>
        <div
          className="sheet report-sheet"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="제보하기"
        >
          <div className="sheet-grip" />
          {!kind ? (
            <>
              <h3>무엇을 알려주실래요?</h3>
              <p className="sheet-sub">보내주신 제보는 AI가 분류하고, 팀이 확인해 반영해요.</p>
              <div className="report-kinds">
                {(Object.keys(KIND_INFO) as ReportKind[]).map((k) => (
                  <button
                    key={k}
                    className={`report-kind report-kind-${k}`}
                    onClick={() => setKind(k)}
                  >
                    <span className="report-kind-icon" aria-hidden="true">
                      {KIND_INFO[k].icon}
                    </span>
                    <span>
                      <b>{KIND_INFO[k].title}</b>
                      <small>{KIND_INFO[k].sub}</small>
                    </span>
                  </button>
                ))}
              </div>
              <button className="report-mine-link" onClick={onOpenMine}>
                내 제보 현황 보기 ›
              </button>
            </>
          ) : (
            <>
              <div className="report-head">
                {!fixedKind && (
                  <button
                    className="icon-btn"
                    onClick={() => setKind(null)}
                    aria-label="종류 다시 고르기"
                  >
                    <IconBack />
                  </button>
                )}
                <h3>
                  <span aria-hidden="true">{KIND_INFO[kind].icon}</span> {KIND_INFO[kind].title}
                </h3>
              </div>
              {kind === 'closure' && (
                <p className="sheet-sub">
                  팀이 확인하면 다른 사람의 길안내가 이 지점을 피해서 가요.
                </p>
              )}

              {kind === 'course' ? (
                <div className="report-field">
                  <span className="report-label">코스</span>
                  <button
                    className={`report-loc ${from ? '' : 'is-empty'}`}
                    onClick={() => setPicking('from')}
                  >
                    <small>출발</small>
                    {from?.label ?? '어디서 출발하나요?'}
                  </button>
                  <button
                    className={`report-loc ${to ? '' : 'is-empty'}`}
                    onClick={() => setPicking('to')}
                  >
                    <small>도착</small>
                    {to?.label ?? '어디까지 가는 길인가요?'}
                  </button>
                </div>
              ) : (
                <div className="report-field">
                  <span className="report-label">위치</span>
                  <div className="report-loc-row">
                    <span className={`report-loc-value ${loc ? '' : 'is-empty'}`}>
                      {loc?.label ??
                        (kind === 'issue' ? '위치 없음 (내용에 적어주세요)' : '위치를 골라주세요')}
                    </span>
                    <button className="chip chip-ghost" onClick={() => setPicking('loc')}>
                      검색
                    </button>
                    <button
                      className={`chip ${mapOpen ? 'chip-primary' : 'chip-ghost'}`}
                      onClick={() => setMapOpen((v) => !v)}
                    >
                      지도에서
                    </button>
                  </div>
                  {mapOpen && (
                    <div className="report-map">
                      <CampusMap
                        level={level}
                        onLevel={setLevel}
                        current={loc?.node}
                        onPick={(n) => setLoc({ node: n, label: NODE_BY_ID.get(n)!.title })}
                      />
                      <p className="report-hint">지도를 누르면 가장 가까운 촬영 지점이 골라져요</p>
                    </div>
                  )}
                </div>
              )}

              {(kind === 'issue' || kind === 'closure') && (
                <div className="report-field">
                  <span className="report-label">
                    {kind === 'closure' ? '무슨 일인가요?' : '어떤 점이 달랐나요?'}
                  </span>
                  <div className="report-chips">
                    {(kind === 'closure' ? CLOSURE_TYPES : ISSUE_TYPES).map((t) => (
                      <button
                        key={t}
                        className={`chip ${type === t ? 'chip-primary' : ''}`}
                        aria-pressed={type === t}
                        onClick={() => setType(type === t ? null : t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {kind === 'closure' && (
                <div className="report-field">
                  <span className="report-label">언제까지일 것 같나요?</span>
                  <div className="seg" role="radiogroup" aria-label="기간">
                    {DURATIONS.map(([label, d]) => (
                      <button
                        key={label}
                        role="radio"
                        aria-checked={days === d}
                        onClick={() => setDays(d)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {kind === 'course' && (
                <div className="report-field">
                  <span className="report-label">어떤 사람에게 좋은 길인가요? (여러 개)</span>
                  <div className="report-chips">
                    {COURSE_TAGS.map((t) => {
                      const on = tags.includes(t);
                      return (
                        <button
                          key={t}
                          className={`chip ${on ? 'chip-primary' : ''}`}
                          aria-pressed={on}
                          onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {kind !== 'praise' && (
                <div className="report-field">
                  <span className="report-label">사진 (선택)</span>
                  {preview ? (
                    <div className="report-photo">
                      <img src={preview} alt="첨부한 사진" />
                      <button className="chip" onClick={() => pickPhoto(undefined)}>
                        사진 빼기
                      </button>
                    </div>
                  ) : (
                    <label className={`report-photo-add ${features.photo ? '' : 'is-off'}`}>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={!features.photo}
                        onChange={(e) => pickPhoto(e.target.files?.[0])}
                      />
                      📷 {features.photo ? '현장 사진 추가' : '사진 저장소 연결 후 쓸 수 있어요'}
                    </label>
                  )}
                </div>
              )}

              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={MEMO_HINT[kind]}
                rows={3}
                maxLength={1000}
              />
              <button
                className="btn btn-primary btn-block"
                disabled={sending || !ready}
                onClick={send}
              >
                {sending ? '보내는 중…' : '보내기'}
              </button>
            </>
          )}
        </div>
      </div>

      {picking && (
        <div className="report-picker">
          <PlacePicker
            title={
              picking === 'to'
                ? '어디까지 가는 길인가요?'
                : picking === 'from'
                  ? '어디서 출발하는 길인가요?'
                  : '어디인가요?'
            }
            placeholder="건물·장소·촬영 지점 이름"
            withNodes
            onPick={onPicked}
            onClose={() => setPicking(null)}
          />
        </div>
      )}
    </>
  );
}
