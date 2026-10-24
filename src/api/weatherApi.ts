import { getJson } from '@/api/client';

export interface Weather {
  wet: boolean;
  kind: 'rain' | 'snow' | 'sleet' | null;
  temp: number | null;
  source: 'kma' | 'open-meteo' | 'demo';
}

/** 캠퍼스(성북구) 현재 날씨 — 비·눈이면 실내·지하 길을 우선한다 */
export const fetchWeather = () => getJson<Weather | null>('/api/weather', 6000, null);
