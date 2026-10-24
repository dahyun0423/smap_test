import { getAdminKey, getJson, postJson } from '@/api/client';

export type ReportKind = 'issue' | 'closure' | 'course' | 'praise';
export type ReportStatus = 'received' | 'checking' | 'applied' | 'rejected';

export interface Report {
  kind: ReportKind;
  node: string;
  step?: number;
  type: string | null;
  memo: string;
  /** 통행 불가 예상 마지막 날 (YYYY-MM-DD, null = 모름) */
  until?: string | null;
  fromNode?: string;
  toNode?: string;
  tags?: string[];
  /** /api/photo가 돌려준 비공개 저장 경로 */
  photo?: string;
}

export interface MyReport {
  id: number;
  created_at: string;
  kind: ReportKind;
  node: string;
  type: string | null;
  memo: string | null;
  status: ReportStatus;
  until: string | null;
  from_node: string | null;
  to_node: string | null;
  tags: string[] | null;
  has_photo?: boolean;
  updated_at: string | null;
  /** 서버에 못 보내고 이 기기에만 남은 제보 */
  local?: boolean;
}

export interface FeedbackRow extends Omit<MyReport, 'has_photo' | 'local'> {
  step: number | null;
  photo: string | null;
  ai_category: string | null;
  ai_severity: number | null;
  ai_action: string | null;
}

export interface Closure {
  id: number;
  node: string;
  type: string | null;
  until: string | null;
}

/** 기기별 익명 번호 — '내 제보' 조회에만 쓴다 (개인정보 없음) */
export function clientId(): string {
  try {
    let id = localStorage.getItem('smap.cid');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('smap.cid', id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

export function sendReport(report: Report) {
  return postJson<{ ok: boolean; id: number }>(
    '/api/feedback',
    { ...report, cid: clientId() },
    20000
  );
}

/** 사진을 1280px JPEG로 줄여 비공개 저장소에 올린다. 저장소가 없으면 null */
export async function uploadPhoto(file: File): Promise<string | null> {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.8));
    if (!blob) return null;
    const r = await fetch('/api/photo', {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: blob,
      signal: AbortSignal.timeout(30000),
    });
    return r.ok ? ((await r.json()) as { path: string }).path : null;
  } catch {
    return null;
  }
}

/** 이 기기에서 보낸 제보와 처리 상태 */
export async function listMyReports(): Promise<MyReport[] | null> {
  const url = `/api/feedback?cid=${encodeURIComponent(clientId())}`;
  const data = await getJson<{ rows: MyReport[] } | null>(url, 10000, null);
  return data?.rows ?? null;
}

/** 지금 못 가는 곳 (관리자가 반영한 통행 불가 제보) */
export async function fetchClosures(): Promise<Closure[]> {
  const data = await getJson<{ rows: Closure[] } | null>('/api/closures', 5000, null);
  return data?.rows ?? [];
}

// ── 관리자 전용 (x-admin-key)

export async function listFeedback(): Promise<FeedbackRow[] | 'forbidden' | null> {
  try {
    const r = await fetch('/api/feedback', {
      headers: { 'x-admin-key': getAdminKey() },
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 403) return 'forbidden';
    return r.ok ? ((await r.json()) as { rows: FeedbackRow[] }).rows : null;
  } catch {
    return null;
  }
}

export async function setReportStatus(id: number, status: ReportStatus) {
  try {
    const r = await fetch('/api/feedback', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-key': getAdminKey() },
      body: JSON.stringify({ id, status }),
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** 비공개 사진 → 화면에 띄울 blob 주소 */
export async function fetchPhotoUrl(path: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/photo?path=${encodeURIComponent(path)}`, {
      headers: { 'x-admin-key': getAdminKey() },
    });
    return r.ok ? URL.createObjectURL(await r.blob()) : null;
  } catch {
    return null;
  }
}
