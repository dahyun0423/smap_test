// 제보를 이 기기(localStorage)에 남기고, '반영됨'으로 바뀐 제보를 찾는다
import type { MyReport, Report, ReportStatus } from '@/api/reportApi';

const LOCAL_KEY = 'smap.myReports';
const SEEN_KEY = 'smap.reportSeen';

const read = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경 */
  }
};

/** 서버 전송에 실패한 제보 — '내 제보'에 '이 기기에만 저장됨'으로 보인다 (최근 50건) */
export function saveLocalReport(r: Report) {
  const all = read<MyReport[]>(LOCAL_KEY, []);
  all.unshift({
    id: -Date.now(),
    created_at: new Date().toISOString(),
    kind: r.kind,
    node: r.node,
    type: r.type,
    memo: r.memo || null,
    status: 'received',
    until: r.until ?? null,
    from_node: r.fromNode ?? null,
    to_node: r.toNode ?? null,
    tags: r.tags ?? null,
    updated_at: null,
    local: true,
  });
  write(LOCAL_KEY, all.slice(0, 50));
}

export const loadLocalReports = () => read<MyReport[]>(LOCAL_KEY, []);

/** 지난번 확인 이후 '반영됨'이 된 제보 (앱을 열 때 감사 알림용) */
export function newlyApplied(rows: MyReport[]): MyReport[] {
  const seen = read<Record<string, ReportStatus>>(SEEN_KEY, {});
  const fresh = rows.filter((r) => r.status === 'applied' && seen[r.id] !== 'applied');
  write(SEEN_KEY, { ...seen, ...Object.fromEntries(rows.map((r) => [r.id, r.status])) });
  return fresh;
}

/** 오늘부터 days일 뒤 날짜 (YYYY-MM-DD). null = 기간 모름 */
export function untilDate(days: number | null): string | null {
  if (days === null) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
