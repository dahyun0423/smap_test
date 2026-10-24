import { useEffect, useState } from 'react';

import { type MyReport, type ReportStatus, listMyReports } from '@/api/reportApi';
import { IconBack } from '@/components/common/Icons';
import { HOME_NODE, KIND_INFO, STATUS_LABEL } from '@/constants/report';
import { NODE_BY_ID } from '@/data/campus';
import { loadLocalReports } from '@/utils/reportStorage';

const STEPS: ReportStatus[] = ['received', 'checking', 'applied'];

/** 제보 위치 표시 문구 */
const where = (r: MyReport) =>
  r.kind === 'course'
    ? `${NODE_BY_ID.get(r.from_node ?? '')?.title ?? '?'} → ${NODE_BY_ID.get(r.to_node ?? '')?.title ?? '?'}`
    : r.node === HOME_NODE
      ? '위치 없이 보낸 제보'
      : (NODE_BY_ID.get(r.node)?.title ?? r.node);

/** 내 제보 현황 — 이 기기에서 보낸 제보의 처리 단계 (받음 → 확인 중 → 반영됨) */
export default function MyReports({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<MyReport[] | null>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    void listMyReports().then((r) => {
      setOnline(!!r);
      setRows(
        [...loadLocalReports(), ...(r ?? [])].sort((a, b) =>
          b.created_at.localeCompare(a.created_at)
        )
      );
    });
  }, []);

  return (
    <div className="screen my-reports" role="dialog" aria-label="내 제보 현황">
      <div className="picker-head">
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          <IconBack />
        </button>
        <p className="picker-head-title">내 제보 현황</p>
      </div>
      {!online && <p className="admin-msg">서버 연결 전이라 이 기기에 저장된 제보만 보여요.</p>}
      {rows === null && <p className="admin-msg">불러오는 중…</p>}
      {rows?.length === 0 && (
        <p className="empty">
          아직 보낸 제보가 없어요.
          <br />
          길이 헷갈리거나 못 가는 곳이 있으면 알려주세요!
        </p>
      )}
      <ul className="mine-list">
        {rows?.map((r) => {
          const i = STEPS.indexOf(r.status);
          return (
            <li key={r.id} className={`mine-card is-${r.status}`}>
              <div className="mine-head">
                <span aria-hidden="true">{KIND_INFO[r.kind].icon}</span>
                <b>{KIND_INFO[r.kind].title}</b>
                <small>
                  {new Date(r.created_at).toLocaleDateString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </small>
              </div>
              <p className="mine-where">{where(r)}</p>
              {(r.type || r.memo) && (
                <p className="mine-memo">{[r.type, r.memo].filter(Boolean).join(' — ')}</p>
              )}
              {r.local ? (
                <p className="mine-local">이 기기에만 저장됨 · 서버가 연결되면 다시 보내 주세요</p>
              ) : r.status === 'rejected' ? (
                <p className="mine-rejected">이번엔 반영하지 못했어요. 알려줘서 고마워요!</p>
              ) : (
                <ol className="mine-steps" aria-label={`처리 상태: ${STATUS_LABEL[r.status]}`}>
                  {STEPS.map((s, j) => (
                    <li key={s} className={j <= i ? 'is-done' : ''}>
                      {STATUS_LABEL[s]}
                    </li>
                  ))}
                </ol>
              )}
              {r.status === 'applied' && (
                <p className="mine-thanks">🎉 반영됐어요. 덕분에 길안내가 더 정확해졌어요!</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
