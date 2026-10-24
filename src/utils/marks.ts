// 360 사진 위에 띄우는 표시(이름표·출입 제한 ✕)
import { type Mark, loadAllEdits } from '@/data/edits';

const MARKS: Record<string, Mark[]> = { ...loadAllEdits().marks };
const NONE: Mark[] = [];

export const marksOf = (node: string) => MARKS[node] ?? NONE;

/** 편집기에서 바로 반영 (null = 그 지점 표시 모두 삭제) */
export const setMarksLive = (node: string, list: Mark[] | null) => {
  if (list?.length) MARKS[node] = list;
  else delete MARKS[node];
};
