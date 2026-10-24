import { getAdminKey, getJson, postJson } from '@/api/client';

/** 서버에 저장된 화살표 방향 보정값 ('from>to' → 도) */
export const fetchRemoteYaw = () => getJson<Record<string, number>>('/api/yaw', 5000, {});

/** 보정값을 서버에 저장 (관리자 키 필요) */
export function saveRemoteYaw(values: Record<string, number>) {
  return postJson<{ saved: number }>('/api/yaw', values, 15000, { 'x-admin-key': getAdminKey() });
}
