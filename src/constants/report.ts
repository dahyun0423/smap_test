import type { ReportKind, ReportStatus } from '@/api/reportApi';

/** 특정 지점이 아닌 '앱 전체'에 대한 제보의 node 값 */
export const HOME_NODE = 'home';

export const KIND_INFO: Record<
  ReportKind,
  { icon: string; title: string; sub: string; thanks: string }
> = {
  issue: {
    icon: '⚠️',
    title: '정보가 틀려요',
    sub: '사진·방향·층 안내가 현장과 달라요',
    thanks: '알려줘서 고마워요! 확인하고 반영할게요.',
  },
  closure: {
    icon: '🚧',
    title: '지금 못 가요',
    sub: '공사·통로 폐쇄·엘리베이터 고장',
    thanks: '고마워요! 확인되면 길안내가 이 지점을 피해 가요.',
  },
  course: {
    icon: '🧭',
    title: '더 좋은 길 알려줄게요',
    sub: '짐 많을 때·언덕 피하는 길·지름길',
    thanks: '좋은 길 고마워요! 확인 후 코스로 추가할게요.',
  },
  praise: {
    icon: '👍',
    title: '안내가 정확해요',
    sub: '잘 맞았던 곳을 알려주세요',
    thanks: '고마워요! 이 안내를 검증됨으로 기록할게요.',
  },
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  received: '받음',
  checking: '확인 중',
  applied: '반영됨',
  rejected: '반영 안 됨',
};

// 제보 시트 선택지
export const ISSUE_TYPES = [
  '건물이나 출입구를 구분하기 어려워요',
  '이동 방향(화살표)이 틀려요',
  '층 변경 안내가 부족해요',
  '사진·설명이 현장과 달라요',
  '기타',
];
export const CLOSURE_TYPES = [
  '공사 중',
  '통로·출입구 폐쇄',
  '엘리베이터 고장',
  '미끄럽거나 위험해요',
  '기타',
];
/** 통행 불가 예상 기간 [표시 문구, 오늘부터 며칠 뒤까지 (null = 모름)] */
export const DURATIONS: [string, number | null][] = [
  ['오늘만', 0],
  ['이번 주', 6],
  ['잘 모르겠어요', null],
];
export const COURSE_TAGS = [
  '짐 많을 때',
  '언덕 싫어',
  '빠른 길',
  '비 올 때 실내로',
  '엘리베이터 위주',
  '한적한 길',
];
export const MEMO_HINT: Record<ReportKind, string> = {
  issue: '어디가 어떻게 달랐는지 적어주세요 (선택)',
  closure: '예) 북악관 지하 연결통로 셔터가 내려가 있어요 (선택)',
  course: '어떻게 가는 길인지 적어주세요. 예) 버정에서 혜인관 엘리베이터 → 스콘스퀘어',
  praise: '어떤 점이 좋았나요? (선택)',
};
