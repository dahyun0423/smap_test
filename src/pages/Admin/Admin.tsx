import { useEffect, useMemo, useState } from 'react';

import { getAdminKey, setAdminKey } from '@/api/client';
import {
  type FeedbackRow,
  type ReportStatus,
  fetchPhotoUrl,
  listFeedback,
  setReportStatus,
} from '@/api/reportApi';
import { IconBack } from '@/components/common/Icons';
import { HOME_NODE, KIND_INFO, STATUS_LABEL } from '@/constants/report';
import { NODE_BY_ID } from '@/data/campus';

interface Props {
  onOpenNode: (node: string) => void;
  onClose: () => void;
}

// AI 긴급도(1~3) 표시 문구
const SEV = ['', '사소함', '헷갈림', '길 잃음'];
// 처리 상태 변경 버튼
const NEXT: ReportStatus[] = ['checking', 'applied', 'rejected'];
const title = (n: string | null) => (n ? (NODE_BY_ID.get(n)?.title ?? n) : '?');

/**
 * 제보 관리 화면 (?admin=1) — 제보를 지점별로 묶어 AI 분류와 함께 보여주고 처리 상태를 바꾼다.
 * '지금 못 가요'를 반영됨으로 바꾸면 모든 사용자의 길안내가 그 지점을 피한다.
 */
export default function Admin({ onOpenNode, onClose }: Props) {
  const [key, setKey] = useState(getAdminKey);
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<number, string>>({});

  const load = async () => {
    setAdminKey(key);
    setMsg('불러오는 중…');
    const r = await listFeedback();
    if (r === 'forbidden') {
      setRows(null);
      setMsg('관리자 키가 맞지 않아요');
    } else if (!r) {
      setRows(null);
      setMsg('서버(DB)에 연결되지 않았어요');
    } else {
      setRows(r);
      setMsg(null);
    }
  };
  useEffect(() => {
    if (key) void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeStatus = async (r: FeedbackRow, status: ReportStatus) => {
    if (await setReportStatus(r.id, status))
      setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, status } : x)) ?? null);
    else setMsg('상태를 바꾸지 못했어요 (관리자 키 확인)');
  };
  const showPhoto = async (r: FeedbackRow) => {
    const url = r.photo ? await fetchPhotoUrl(r.photo) : null;
    if (url) setPhotos((p) => ({ ...p, [r.id]: url }));
  };

  // 긴급도 높은 지점부터
  const byNode = useMemo(() => {
    const m = new Map<string, FeedbackRow[]>();
    for (const r of rows ?? []) m.set(r.node, [...(m.get(r.node) ?? []), r]);
    return [...m.entries()].sort(
      (a, b) =>
        Math.max(...b[1].map((x) => x.ai_severity ?? 0)) -
          Math.max(...a[1].map((x) => x.ai_severity ?? 0)) || b[1].length - a[1].length
    );
  }, [rows]);

  return (
    <div className="screen admin" role="dialog" aria-label="관리자 화면">
      <div className="picker-head">
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          <IconBack />
        </button>
        <div className="search-field">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="관리자 키"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load();
            }}
          />
        </div>
        <button className="btn btn-small btn-primary" onClick={() => void load()}>
          보기
        </button>
      </div>
      <p className="picker-title">
        제보 {rows ? `${rows.length}건 · 지점 ${byNode.length}곳` : ''}
      </p>
      {msg && <p className="admin-msg">{msg}</p>}
      <ul className="admin-list">
        {byNode.map(([node, list]) => (
          <li key={node} className="admin-card">
            <div className="admin-card-head">
              <b>
                {node === HOME_NODE ? '홈 제보 (지점 없음)' : (NODE_BY_ID.get(node)?.title ?? node)}
              </b>
              <span>{list.length}건</span>
              {NODE_BY_ID.has(node) && (
                <button className="btn btn-small btn-ghost" onClick={() => onOpenNode(node)}>
                  거리뷰
                </button>
              )}
            </div>
            {list.map((r) => (
              <div key={r.id} className={`admin-item sev-${r.ai_severity ?? 0}`}>
                <p>
                  <span className={`admin-tag kind-${r.kind ?? 'issue'}`}>
                    {KIND_INFO[r.kind ?? 'issue'].icon} {KIND_INFO[r.kind ?? 'issue'].title}
                  </span>
                  <span className={`admin-tag status-${r.status ?? 'received'}`}>
                    {STATUS_LABEL[r.status ?? 'received']}
                  </span>
                  {r.ai_category && <span className="admin-tag">{r.ai_category}</span>}
                  {r.ai_severity ? <span className="admin-tag">{SEV[r.ai_severity]}</span> : null}
                  <small>{new Date(r.created_at).toLocaleString('ko-KR')}</small>
                </p>
                {r.kind === 'course' && (
                  <p>
                    <b>
                      {title(r.from_node)} → {title(r.to_node)}
                    </b>
                  </p>
                )}
                <p>
                  {r.type}
                  {r.memo ? ` — ${r.memo}` : ''}
                </p>
                {r.until && <p className="admin-until">{r.until.slice(0, 10)}까지 (사용자 예상)</p>}
                {r.ai_action && <p className="admin-action">→ {r.ai_action}</p>}
                {r.photo &&
                  (photos[r.id] ? (
                    <img className="admin-photo" src={photos[r.id]} alt="제보 사진" />
                  ) : (
                    <button className="btn btn-small btn-ghost" onClick={() => void showPhoto(r)}>
                      사진 보기
                    </button>
                  ))}
                <div className="admin-status">
                  {NEXT.map((s) => (
                    <button
                      key={s}
                      className={`chip ${r.status === s ? 'chip-primary' : ''}`}
                      onClick={() => void changeStatus(r, s)}
                    >
                      {s === 'applied' && r.kind === 'closure'
                        ? '반영 (길안내에서 피하기)'
                        : STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
