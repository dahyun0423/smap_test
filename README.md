# SMAP — 서경대학교 360° 캠퍼스 길찾기

캠퍼스 곳곳을 촬영한 360° 사진으로 만든 모바일 웹앱입니다.
검색·음성으로 목적지를 찾고, 거리뷰를 한 단계씩 넘기며 출입구·층·연결통로까지 안내합니다.

## 기술 스택

- React 19 · TypeScript · Vite
- [Photo Sphere Viewer](https://photo-sphere-viewer.js.org/) — 360° 뷰어
- Vercel Functions (`api/`) — AI 문장 해석, 음성 인식, 제보, 날씨
- Supabase — 사진 저장소, 편집기 수정값 공유

## 시작하기

```bash
npm install
cp .env.example .env.local   # 값 채우기 (VITE_IMG_BASE가 있어야 사진이 보입니다)
npm run dev                  # http://localhost:5173
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 체크 + 빌드 |
| `npm run lint` | oxlint |
| `npm run format` | Prettier 정렬 (import 순서 포함) |
| `npm run check-data` | 사진 ↔ 지점·연결 데이터 점검 |

> 360 사진(`public/pano` 등)은 용량이 커서 저장소에 올리지 않습니다. `VITE_IMG_BASE`(Supabase 공개 버킷 주소)를 넣으면 거기서 읽습니다.
> 서버 키(`ANTHROPIC_API_KEY` 등)가 없어도 앱은 동작하고, 해당 기능만 브라우저 방식으로 대체됩니다.

## 폴더 구조

```
src/
├── main.tsx            # 진입점 — 공유 수정값을 받은 뒤 App 렌더
├── App.tsx             # 화면 전환 · 길안내 상태
├── pages/              # 화면 단위
│   ├── Home/           # 홈 (검색 · 길찾기 카드 · 캠퍼스 지도)
│   ├── Viewer/         # 360 거리뷰 · 단계별 안내
│   ├── Admin/          # 제보 관리 (?admin=1)
│   └── Editor/         # 사진·연결 편집기 (?tag=1, PC용)
├── components/
│   ├── common/         # 아이콘
│   ├── layout/         # 탭바 · 스플래시
│   ├── home/           # 길찾기 카드 · 건물/시설 시트
│   ├── map/            # 캠퍼스 미니맵
│   ├── viewer/         # 360 뷰어 · 단계 카드 · 층 이동 · 방 목록
│   ├── search/         # 장소 검색 · 음성 입력
│   └── report/         # 제보 · 내 제보
├── api/                # 서버(/api/*) 요청 — 도메인별 파일
├── hooks/              # useToast · useSpeechRecognition · useRecorder
├── utils/              # 경로 탐색(graph) · 검색 · 위치 · 호실 · 내보내기
├── constants/          # 화면 문구·선택지
├── data/               # 캠퍼스 데이터 (건물 · 지점 · 연결 · 장소 · 편집값)
├── types/              # 공통 타입
└── styles/             # 전역 CSS
api/                    # Vercel Functions
scripts/                # 데이터 생성·사진 변환 스크립트
```

- import는 `@/` 별칭(= `src/`)을 씁니다. 단, `data/*.ts`와 `utils/rooms.ts`는 `scripts/check-data.ts`가 node로 직접 불러오므로 상대 경로 + `.ts` 확장자를 유지합니다.
- 길 그래프는 모듈을 불러올 때 한 번 만들어집니다(`utils/graph.ts`). 편집기는 그래프를 직접 고쳐 새로고침 없이 반영합니다.

## 핵심 개념

| 용어 | 설명 |
|---|---|
| 지점 (node) | 360 사진 한 장 = 지점 하나. `data/campus.ts`의 `NODES` |
| 연결 (edge) | 지점 사이 이동 (`walk` · `door` · `passage` · `stairs` · `elevator`), 항상 양방향 |
| 장소 (place) | 검색 대상 (건물 · 시설 · 부서 · 교수 연구실 · 호실). 도착 지점(node)을 가짐 |
| yaw | 사진 속 이동 화살표 방향(도). 키는 `'출발>도착'` |

## URL 파라미터

| 상황 | 예시 |
|---|---|
| 학교 포털 링크 | `/?src=portal` |
| NFC·QR 태그 (태그 위치 = 출발지) | `/?src=nfc&from=bus_stop` |
| 안내 링크 (바로 길안내) | `/?from=f-gate&to=b-chungwoon` |
| 특정 지점 거리뷰 | `/?node=hill_moonye_3way` |
| 화살표 방향 보정 | `/?edit=1&node=road_parking_4way` |
| 사진 편집기 (팀용) | `/?tag=1` |
| 제보 관리 (팀용) | `/?admin=1` |
| 날씨 강제 (테스트) | `/?weather=rain` |

`from`·`to`에는 장소 id(`PLACES`) 또는 지점 id를 넣습니다.

## 데이터 작업

- 사진 추가: `scripts/pano-map.json`에 `파일명 → id`를 적고 `python3 scripts/convert-panos.py <zip>`
- 층별 촬영분(Insta360 `.insp`): `stitch-insp.py` → `build-floor-panos.py` → `import-floor-panos.py`
- **얼굴 블러 (공개 전 필수)**: `python3 scripts/blur-faces.py public/pano public/door` — 원본은 `raw/`(git 제외)
- 사진 업로드: `node scripts/upload-images-supabase.mjs`

## 브랜치 · 커밋

- `main`(배포) ← `develop`(통합) ← `feature/*` · `fix/*` · `refactor/*`
- 커밋: `✨ Feat: 내용` · `🐛 Fix:` · `🎨 Design:` · `♻️ Refactor:` · `🔧 Settings:` · `📝 Docs:`
