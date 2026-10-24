import { useCallback, useEffect, useState } from 'react';

import { type Features, getFeatures } from '@/api/client';
import {
  type Closure,
  type ReportKind,
  fetchClosures,
  listMyReports,
  sendReport,
} from '@/api/reportApi';
import { type Weather, fetchWeather } from '@/api/weatherApi';
import { fetchRemoteYaw } from '@/api/yawApi';
import Splash from '@/components/layout/Splash';
import MyReports from '@/components/report/MyReports';
import ReportSheet from '@/components/report/ReportSheet';
import PlacePicker from '@/components/search/PlacePicker';
import VoiceSheet from '@/components/search/VoiceSheet';
import { KIND_INFO } from '@/constants/report';
import { NODE_BY_ID, PLACES } from '@/data/campus';
import useToast from '@/hooks/useToast';
import Admin from '@/pages/Admin/Admin';
import Editor from '@/pages/Editor/Editor';
import Home from '@/pages/Home/Home';
import Viewer from '@/pages/Viewer/Viewer';
import type { ActiveRoute, Spot } from '@/types';
import { type RouteMode, edgeBetween, findRoute, setBlocked, setRemoteYaw } from '@/utils/graph';
import { newlyApplied, saveLocalReport } from '@/utils/reportStorage';
import type { VoiceIntent } from '@/utils/search';
import { speak } from '@/utils/speech';
import { placeToSpot } from '@/utils/spot';

// 앱 루트 — 화면 전환(홈 · 거리뷰 · 검색 · 음성 · 제보)과 길안내 상태를 관리한다.
// URL 파라미터: from·to(장소/지점 id), node(거리뷰), src(nfc·portal), edit·tag·admin(팀용 화면), weather(테스트)

/** URL 값(장소 id 또는 360 지점 id) → Spot */
function spotFromParam(v: string | null): Spot | null {
  if (!v) return null;
  const p = PLACES.find((x) => x.id === v);
  if (p) return placeToSpot(p);
  const n = NODE_BY_ID.get(v);
  return n ? { node: n.id, label: n.title } : null;
}

/** Spot → URL 값 (공유 링크용) */
const spotParam = (s: Spot) => s.place?.id ?? s.node;

type Picker = null | 'from' | 'to';

const PARAMS = new URLSearchParams(location.search);

// 앱 시작 시 날씨를 한 번 받는다. ?weather=rain|snow|sleet면 테스트용으로 강제
const FORCED = PARAMS.get('weather');
const WEATHER_P: Promise<Weather | null> =
  FORCED === 'rain' || FORCED === 'snow' || FORCED === 'sleet'
    ? Promise.resolve({ wet: true, kind: FORCED, temp: null, source: 'demo' })
    : fetchWeather();

export default function App() {
  const params = PARAMS;
  const editMode = params.get('edit') === '1';
  const [adminOpen, setAdminOpen] = useState(params.get('admin') === '1');
  // 사진 편집기 (팀용)
  const [tagOpen, setTagOpen] = useState(params.get('tag') === '1');
  const [features, setFeatures] = useState<Features>({ llm: false, stt: false, db: false });
  const [yawRev, setYawRev] = useState(0);
  const [from, setFrom] = useState<Spot | null>(() => spotFromParam(params.get('from')));
  const [to, setTo] = useState<Spot | null>(() => spotFromParam(params.get('to')));
  const [mode, setMode] = useState<RouteMode>('outdoor');
  // 비·눈이 오면 실내·지하 길 우선을 자동으로 켠다 (사용자가 끌 수 있음)
  const [weather, setWeather] = useState<Weather | null>(null);
  const [indoor, setIndoor] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [voice, setVoice] = useState(false);
  const [report, setReport] = useState<null | { node?: string; step?: number; kind?: ReportKind }>(
    null
  );
  const [mine, setMine] = useState(false);
  const [closures, setClosures] = useState<Closure[]>([]);
  // 스플래시 (팀용 화면은 건너뜀)
  const [splash, setSplash] = useState(!adminOpen && !editMode && !tagOpen);
  const nfc = params.get('src') === 'nfc';
  const endSplash = useCallback(() => setSplash(false), []);
  const [viewNode, setViewNode] = useState<string | null>(() =>
    !tagOpen && NODE_BY_ID.has(params.get('node') ?? '') ? params.get('node') : null
  );
  const [route, setRoute] = useState<ActiveRoute | null>(null);
  const { message: toastMsg, toast } = useToast();

  const startRoute = useCallback(
    (f: Spot, t: Spot, m: RouteMode = mode, inside: boolean = indoor, wet = !!weather?.wet) => {
      const path = findRoute(f.node, t.node, m, inside);
      if (!path) {
        toast('아직 연결된 길 데이터가 없어요');
        return false;
      }
      if (
        m === 'elevator' &&
        path.some((id, i) => i > 0 && edgeBetween(path[i - 1], id)?.via === 'stairs')
      )
        toast('엘리베이터로만 가는 길이 없어서 계단이 조금 포함돼요');
      setRoute({ from: f, to: t, path });
      if (inside && wet) toast('비가 와서 실내·지하 길로 먼저 안내해요');
      setViewNode(path[0]);
      history.pushState({ smap: 'viewer' }, '');
      return true;
    },
    [mode, indoor, weather, toast]
  );

  // 링크(NFC·QR·공유)로 들어온 경우
  useEffect(() => {
    const f = spotFromParam(params.get('from'));
    const t = spotFromParam(params.get('to'));
    // 출발·도착이 다 있으면 날씨를 최대 2.5초(스플래시 동안) 기다렸다가 길안내 시작
    if (f && t)
      void Promise.race([
        WEATHER_P,
        new Promise<null>((ok) => setTimeout(() => ok(null), 2500)),
      ]).then((w) => startRoute(f, t, mode, !!w?.wet, !!w?.wet));
    // 출발지만 있으면(NFC 태그 등) 스플래시가 끝난 뒤 안내 토스트
    else if (f)
      setTimeout(
        () =>
          toast(
            nfc
              ? `출발지를 ${f.label}(으)로 설정했어요. 어디로 갈까요?`
              : `${f.label}에서 접속했어요. 출발지로 설정했어요`
          ),
        nfc ? 2800 : 2200
      );
    else if (params.get('src') === 'portal')
      setTimeout(
        () => toast('서경대 포털에서 오셨네요. 어디로 갈지 검색하거나 말로 물어보세요'),
        2200
      );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 서버 기능 확인 → 통행 불가 지점·내 제보 반영 알림, 날씨, 화살표 보정값
  useEffect(() => {
    void getFeatures().then((f) => {
      setFeatures(f);
      if (!f.db) return;
      // 지금 못 가는 곳 → 길안내에서 피함
      void fetchClosures().then((c) => {
        setBlocked(c.map((x) => x.node));
        setClosures(c);
      });
      // 내 제보가 반영됐으면 고마워요 알림 (스플래시 뒤에)
      void listMyReports().then((rows) => {
        const fresh = rows ? newlyApplied(rows) : [];
        if (fresh.length)
          setTimeout(
            () =>
              toast(
                `🎉 제보하신 '${KIND_INFO[fresh[0].kind].title}'${fresh.length > 1 ? ` 외 ${fresh.length - 1}건` : ''}이 반영됐어요. 고마워요!`
              ),
            3000
          );
      });
    });
    void WEATHER_P.then((w) => {
      setWeather(w);
      if (w?.wet) setIndoor(true);
    });
    void fetchRemoteYaw().then((v) => {
      if (Object.keys(v).length) {
        setRemoteYaw(v);
        setYawRev((n) => n + 1);
      }
    });
  }, [toast]);

  // 휴대폰 뒤로가기 → 거리뷰 닫기
  useEffect(() => {
    const onPop = () => {
      setViewNode(null);
      setRoute(null);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const openExplore = (node: string) => {
    setRoute(null);
    setViewNode(node);
    history.pushState({ smap: 'viewer' }, '');
  };
  const exitViewer = () => {
    if (history.state?.smap === 'viewer') history.back();
    else {
      setViewNode(null);
      setRoute(null);
    }
  };

  const onNavigate = (node: string) => {
    if (route && !route.path.includes(node)) {
      // 경로를 벗어나면 그 지점에서 다시 계산
      const path = findRoute(node, route.to.node, mode);
      if (path) {
        setRoute({ ...route, from: { node, label: NODE_BY_ID.get(node)!.title }, path });
        toast('경로를 다시 찾았어요');
      } else setRoute(null);
    }
    setViewNode(node);
  };

  const chooseTo = (s: Spot) => {
    setTo(s);
    setPicker(null);
    if (from) startRoute(from, s);
    else {
      setPicker('from');
      toast(`${s.label}까지 안내할게요. 지금 계신 곳을 골라주세요`);
    }
  };
  const chooseFrom = (s: Spot) => {
    setFrom(s);
    setPicker(null);
    if (to) startRoute(s, to);
  };

  const onVoiceResult = (intent: VoiceIntent) => {
    setVoice(false);
    const t = intent.to ? placeToSpot(intent.to) : null;
    const f = intent.from ? placeToSpot(intent.from) : from;
    if (!t) return;
    setTo(t);
    if (intent.from) setFrom(f);
    const m: RouteMode = intent.avoidStairs ? 'elevator' : mode;
    if (intent.avoidStairs) setMode('elevator');
    // 용무 질문("졸업증명서 떼려면…")의 답은 화면에도 보여준다
    if (intent.reply) toast(intent.reply);
    if (f && f.node !== t.node) {
      speak(
        intent.reply ??
          `${t.label}까지 ${intent.avoidStairs ? '엘리베이터 길로 ' : ''}안내를 시작할게요.`
      );
      startRoute(f, t, m);
    } else {
      speak(
        `${intent.reply ? `${intent.reply} ` : `${t.label}까지 안내할게요. `}지금 계신 곳을 골라주세요.`
      );
      setPicker('from');
    }
  };

  const share = async () => {
    if (!route) return;
    const url = `${location.origin}${location.pathname}?from=${encodeURIComponent(spotParam(route.from))}&to=${encodeURIComponent(spotParam(route.to))}`;
    const text = `SMAP · ${route.from.label} → ${route.to.label} 길 안내`;
    try {
      if (navigator.share) await navigator.share({ title: 'SMAP 길 안내', text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('안내 링크를 복사했어요');
      }
    } catch {
      /* 공유 취소 */
    }
  };

  return (
    <div className="app">
      <Home
        from={from}
        to={to}
        mode={mode}
        onMode={setMode}
        weather={weather}
        indoor={indoor}
        onIndoor={setIndoor}
        onPickFrom={() => setPicker('from')}
        onPickTo={() => setPicker('to')}
        onSwap={() => {
          setFrom(to);
          setTo(from);
        }}
        onGo={() => from && to && startRoute(from, to)}
        onSearch={() => setPicker('to')}
        onVoice={() => setVoice(true)}
        onReport={() => setReport({})}
        closures={closures}
        onExplore={openExplore}
        onMapTab={() => {
          openExplore(from?.node ?? 'gate_front');
          toast(
            from
              ? `지금 위치(${from.label})에서 둘러봐요. 사진 속 화살표로 이동하세요`
              : '정문에서 둘러봐요. 출발지를 정하면 그 자리에서 열려요'
          );
        }}
        onSetFrom={chooseFrom}
        onSetTo={chooseTo}
      />

      {viewNode && (
        <Viewer
          node={viewNode}
          route={route}
          editMode={editMode}
          onNavigate={onNavigate}
          onExit={exitViewer}
          onRouteFromHere={(n) => {
            setFrom({ node: n, label: NODE_BY_ID.get(n)!.title });
            exitViewer();
            setPicker('to');
          }}
          onShare={share}
          toast={toast}
          yawRev={yawRev}
          canSaveRemote={features.db}
          onReport={(node, step, kind) => setReport({ node, step, kind })}
          onPraise={(node) => {
            const r = { kind: 'praise' as const, node, type: null, memo: '' };
            void sendReport(r).then((ok) => {
              if (!ok) saveLocalReport(r);
            });
          }}
        />
      )}

      {picker && (
        <PlacePicker
          key={picker} // 도착 → 출발로 넘어갈 때 검색어를 비운다
          title={picker === 'from' ? '어디에서 출발하나요?' : '어디로 갈까요?'}
          placeholder={picker === 'from' ? '지금 있는 건물·장소' : '건물, 부서, 교수님 이름'}
          withNodes={picker === 'from'}
          onPick={picker === 'from' ? chooseFrom : chooseTo}
          onClose={() => setPicker(null)}
          onVoice={() => {
            setPicker(null);
            setVoice(true);
          }}
        />
      )}

      {voice && (
        <VoiceSheet onClose={() => setVoice(false)} onResult={onVoiceResult} features={features} />
      )}

      {report && (
        <ReportSheet
          {...report}
          near={report.node ? undefined : from}
          features={features}
          onClose={() => setReport(null)}
          onSent={(msg) => {
            setReport(null);
            toast(msg);
          }}
          onOpenMine={() => {
            setReport(null);
            setMine(true);
          }}
        />
      )}

      {mine && <MyReports onClose={() => setMine(false)} />}

      {adminOpen && (
        <Admin
          onOpenNode={(n) => {
            setAdminOpen(false);
            openExplore(n);
          }}
          onClose={() => setAdminOpen(false)}
        />
      )}

      {tagOpen && (
        <Editor
          onClose={() => {
            setTagOpen(false);
            history.replaceState(null, '', location.pathname);
          }}
        />
      )}

      {splash && <Splash nfcPlace={nfc ? from?.label : undefined} onDone={endSplash} />}

      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
