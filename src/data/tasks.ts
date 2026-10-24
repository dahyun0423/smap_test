// 용무 사전 — "졸업증명서 떼려면 어디로 가요?"처럼 할 일을 말해도 담당 부서·시설로 안내한다.
// place = 장소 id. checked=false면 담당 부서 미확인 → 안내 끝에 "확인 중" 문구가 붙는다.
export interface Task {
  id: string;
  label: string;
  /** 말·검색어에 이 중 하나가 들어 있으면 이 용무 (긴 표현을 앞에) */
  keywords: string[];
  place: string;
  /** 안내 화면에 보일 짧은 도착지 이름 (예: '교무처') — 없으면 장소 이름 */
  dest?: string;
  reply: string;
  checked: boolean;
}

export const TASKS: Task[] = [
  {
    id: 'cert',
    label: '증명서 발급 (졸업·재학·성적)',
    keywords: ['졸업증명서', '재학증명서', '성적증명서', '휴학증명서', '증명서', '성적표', '학적'],
    place: 'r-hyein-101',
    dest: '교무처',
    reply: '증명서 발급은 교무처(혜인관 1층 101호)에서 해요. 교무처까지 안내할게요.',
    checked: false,
  },
  {
    id: 'leave',
    label: '휴학·복학·수강 문의',
    keywords: ['휴학', '복학', '수강신청', '수강정정', '학사일정'],
    place: 'r-hyein-101',
    dest: '교무처',
    reply: '휴학·복학·수강 문의는 교무처(혜인관 1층)예요. 안내할게요.',
    checked: false,
  },
  {
    id: 'admission',
    label: '입학 문의',
    keywords: ['입학상담', '입학문의', '원서', '입학'],
    place: 'r-hyein-102',
    dest: '입학처',
    reply: '입학 문의는 혜인관 1층 입학처예요. 안내할게요.',
    checked: true,
  },
  {
    id: 'scholar',
    label: '장학금·학생 지원',
    keywords: ['장학금', '장학', '학생증', '동아리등록'],
    place: 'r-chungwoon-301',
    dest: '학생과',
    reply: '장학금·학생 지원은 청운관 3층 학생과 사무실이에요. 안내할게요.',
    checked: false,
  },
  {
    id: 'health',
    label: '아플 때 (보건실)',
    keywords: ['보건실', '아파', '아픈', '두통', '감기', '다쳤'],
    place: 'r-chungwoon-302',
    dest: '보건실',
    reply: '보건실은 청운관 3층이에요. 바로 안내할게요.',
    checked: true,
  },
  {
    id: 'book',
    label: '책·교재 사기',
    keywords: ['전공책', '교재', '책사', '책을사', '책 사', '서점'],
    place: 'r-chungwoon-101',
    dest: '서점',
    reply: '책은 청운관 1층 서점에서 살 수 있어요. 안내할게요.',
    checked: true,
  },
  {
    id: 'print',
    label: '복사·출력·제본',
    keywords: ['프린트', '출력', '인쇄', '복사', '제본'],
    place: 'r-chungwoon-102',
    dest: '복사실',
    reply: '복사·출력은 청운관 1층 복사실이에요. 안내할게요.',
    checked: true,
  },
  {
    id: 'career',
    label: '취업·진로 상담',
    keywords: ['취업', '진로', '자소서', '이력서', '커리어'],
    place: 'r-yudam-901',
    dest: '진로취업처',
    reply: '취업·진로 상담은 유담관 9층 진로취업처예요. 안내할게요.',
    checked: true,
  },
  {
    id: 'library',
    label: '도서관·공부할 곳',
    keywords: ['책빌리', '책 빌리', '대출', '도서관', '열람실', '공부할'],
    place: 'r-yudam-707',
    dest: '학술정보관',
    reply: '도서관(학술정보관)은 유담관 7층이에요. 안내할게요.',
    checked: true,
  },
  {
    id: 'tuition',
    label: '등록금 납부 문의',
    keywords: ['등록금', '납부', '환불'],
    place: 'r-bonkwan-203',
    dest: '재무과',
    reply: '등록금 문의는 본관 2층 재무과예요. 안내할게요.',
    checked: false,
  },
  {
    id: 'it',
    label: '포털·와이파이·전산',
    keywords: ['와이파이', '포털비밀번호', '비밀번호', '전산', '노트북'],
    place: 'r-bukak-212',
    dest: '정보전산원',
    reply: '포털·와이파이 같은 전산 문의는 북악관 2층 정보전산원이에요. 안내할게요.',
    checked: false,
  },
  {
    id: 'bank',
    label: '은행·ATM',
    keywords: ['atm', '현금', '은행', '돈뽑'],
    place: 'r-yudam-304',
    dest: '신한은행',
    reply: '은행(신한은행)은 유담관 3층이에요. 안내할게요.',
    checked: true,
  },
  {
    id: 'post',
    label: '택배·우편',
    keywords: ['택배', '우편', '등기', '우체국', '소포'],
    place: 'r-yudam-306',
    dest: '우체국',
    reply: '우체국은 유담관 3층이에요. 안내할게요.',
    checked: true,
  },
  {
    id: 'meal',
    label: '밥 먹기',
    keywords: ['밥먹', '밥 먹', '배고', '점심', '학식'],
    place: 'f-cafeteria',
    reply: '학생식당은 북악관 지하1층이에요. 안내할게요.',
    checked: true,
  },
  {
    id: 'dorm',
    label: '기숙사',
    keywords: ['기숙사', '생활관'],
    place: 'b-eunju2',
    reply: '기숙사는 은주2관이에요. 안내할게요.',
    checked: true,
  },
];

export const UNCHECKED_NOTE = ' (담당 부서는 학교에 확인 중이에요)';
