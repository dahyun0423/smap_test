import type { Closure } from '@/api/reportApi';
import { NODE_BY_ID } from '@/data/campus';

/** 지금 못 가는 곳 (관리자가 반영한 통행 불가 제보, 최대 3곳 표시) */
export default function ClosureCard({ closures }: { closures: Closure[] }) {
  return (
    <section className="closure-card" aria-label="지금 못 가는 곳">
      <b>🚧 지금 못 가는 곳 {closures.length}곳</b>
      <ul>
        {closures.slice(0, 3).map((c) => (
          <li key={c.id}>
            {NODE_BY_ID.get(c.node)?.title ?? c.node}
            {c.type ? ` · ${c.type}` : ''}
            {c.until ? ` · ${c.until.slice(5).replace('-', '/')}까지` : ''}
          </li>
        ))}
      </ul>
      <small>길안내가 이곳을 피해서 안내해요</small>
    </section>
  );
}
