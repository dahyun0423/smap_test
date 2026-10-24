import { getAdminKey, setAdminKey } from '@/api/client';
import { saveRemoteYaw } from '@/api/yawApi';
import { NODE_BY_ID } from '@/data/campus';
import { linkYaw, linksOf } from '@/utils/graph';

interface Props {
  node: string;
  /** 이 브라우저에서 보정한 값 ('from>to' → 도) */
  localYaw: Record<string, number>;
  /** 방향을 맞추는 중인 연결의 도착 지점 */
  editingTo: string | null;
  onEdit: (to: string) => void;
  /** 서버 DB가 켜져 있으면 서버 저장 버튼을 보여준다 */
  canSaveRemote?: boolean;
  toast: (msg: string) => void;
}

/** 화살표 방향 보정 패널 (?edit=1) — 길을 고른 뒤 사진에서 그 방향을 탭한다 */
export default function YawEditPanel({
  node,
  localYaw,
  editingTo,
  onEdit,
  canSaveRemote,
  toast,
}: Props) {
  const count = Object.keys(localYaw).length;

  const copy = () => {
    navigator.clipboard?.writeText(JSON.stringify(localYaw, null, 2)).then(
      () => toast('보정값 JSON을 복사했어요 → src/data/yaw.json에 붙여넣기'),
      () => toast('복사 실패')
    );
  };

  const saveRemote = async () => {
    const r = await saveRemoteYaw(localYaw);
    toast(
      r
        ? `서버에 ${r.saved}개 저장 — 모든 사용자에게 반영돼요`
        : '저장 실패 (관리자 키를 확인하세요)'
    );
  };

  return (
    <section className="edit-panel">
      <p>
        <b>방향 보정 모드</b> — 길을 고른 뒤, 사진에서 그 길이 보이는 곳을 탭하세요.
      </p>
      <div className="edit-links">
        {linksOf(node).map((l) => (
          <button
            key={l.to}
            className={`chip ${editingTo === l.to ? 'chip-primary' : ''}`}
            onClick={() => onEdit(l.to)}
          >
            {NODE_BY_ID.get(l.to)?.title} <small>{linkYaw(node, l.to, localYaw)}°</small>
          </button>
        ))}
      </div>
      <button className="btn btn-small" onClick={copy}>
        보정값 복사 ({count})
      </button>
      {canSaveRemote && (
        <div className="edit-remote">
          <input
            type="password"
            placeholder="관리자 키"
            defaultValue={getAdminKey()}
            onChange={(e) => setAdminKey(e.target.value)}
            aria-label="관리자 키"
          />
          <button className="btn btn-small btn-primary" disabled={!count} onClick={saveRemote}>
            서버에 저장
          </button>
        </div>
      )}
    </section>
  );
}
