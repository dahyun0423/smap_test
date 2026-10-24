import { useEffect, useState } from 'react';

import type { Features } from '@/api/client';
import { parseWithAI, transcribe } from '@/api/voiceApi';
import { IconClose, IconMic } from '@/components/common/Icons';
import { PLACES, type Place } from '@/data/campus';
import useRecorder, { canRecord } from '@/hooks/useRecorder';
import useSpeechRecognition, { speechSupported } from '@/hooks/useSpeechRecognition';
import { type VoiceIntent, candidatesFor, parseUtterance } from '@/utils/search';

interface Props {
  onClose: () => void;
  onResult: (intent: VoiceIntent, text: string) => void;
  /** 서버 기능 (없으면 브라우저 음성인식 + 규칙 해석) */
  features: Features;
}

const EXAMPLES = [
  '졸업증명서 떼려면 어디로 가요?',
  '전공책 어디서 사요?',
  '유담관이 어디에요?',
  '북악관에서 문예관 가는 길',
  '계단 말고 혜인관 가는 길',
];
const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));

// 말로 길 묻기.
// 서버 음성 인식(Whisper)이 켜져 있으면 녹음 → /api/stt, 아니면 브라우저 Web Speech로 받아쓴다.
// 받아쓴 문장은 AI 해석(/api/parse) → 실패 시 규칙 해석(parseUtterance) 순서로 목적지를 찾는다.
export default function VoiceSheet({ onClose, onResult, features }: Props) {
  const [heard, setHeard] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | '알아듣는 중…' | '찾는 중…'>(null);
  const [candidates, setCandidates] = useState<Place[] | null>(null);
  const [aiReply, setAiReply] = useState<string | null>(null);

  const handle = async (text: string) => {
    setHeard(text);
    setCandidates(null);
    setAiReply(null);
    if (features.llm) {
      setBusy('찾는 중…');
      const ai = await parseWithAI(text, candidatesFor(text));
      setBusy(null);
      const to = ai?.to ? PLACE_BY_ID.get(ai.to) : undefined;
      if (to) {
        const from = ai?.from ? PLACE_BY_ID.get(ai.from) : undefined;
        onResult(
          { to, from, candidates: [], avoidStairs: ai!.avoidStairs, reply: ai!.reply },
          text
        );
        return;
      }
      // AI가 장소를 못 고르면 답변만 보여주고 규칙 해석 후보로 넘어간다
      if (ai) setAiReply(ai.reply);
    }
    const intent = parseUtterance(text);
    if (intent.to) onResult(intent, text);
    else setCandidates(intent.candidates);
  };

  const useServer = features.stt && canRecord;
  const sr = useSpeechRecognition((t) => {
    void handle(t);
  });
  const recorder = useRecorder(async (audio) => {
    setBusy('알아듣는 중…');
    const text = await transcribe(audio);
    setBusy(null);
    if (text) void handle(text);
    else setCandidates([]);
  });

  const listening = useServer ? recorder.recording : sr.listening;
  const start = () => {
    setCandidates(null);
    setHeard(null);
    setAiReply(null);
    if (useServer) void recorder.start();
    else sr.start();
  };
  const stop = () => (useServer ? recorder.stop() : sr.stop());
  useEffect(() => {
    start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const error = useServer ? recorder.error : sr.error;
  const hint =
    busy ??
    (listening
      ? useServer
        ? '듣고 있어요… 다 말하면 버튼을 누르세요'
        : '듣고 있어요…'
      : heard
        ? '이렇게 들었어요'
        : '버튼을 누르고 말해 주세요');

  return (
    <div className="voice" role="dialog" aria-label="음성으로 길 묻기">
      <button className="icon-btn voice-close" onClick={onClose} aria-label="닫기">
        <IconClose />
      </button>
      <div className="voice-body">
        <p className="voice-hint">{hint}</p>
        <p className="voice-text">
          {(!useServer && sr.interim) || heard || '“유담관이 어디에요?”'}
        </p>

        {candidates && (
          <div className="voice-cands">
            {candidates.length ? (
              <p>{aiReply ?? '혹시 이곳인가요?'}</p>
            ) : (
              <p>{aiReply ?? '등록된 장소를 찾지 못했어요. 건물 이름을 넣어 다시 말해 주세요.'}</p>
            )}
            {candidates.map((p) => (
              <button
                key={p.id}
                className="chip"
                onClick={() => onResult({ to: p, candidates: [] }, p.name)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        {error && <p className="voice-error">{error}</p>}
      </div>

      <button
        className={`mic-big ${listening ? 'is-on' : ''}`}
        onClick={listening ? stop : start}
        aria-label={listening ? '그만 듣기' : '다시 말하기'}
        disabled={!!busy || (!useServer && !speechSupported)}
      >
        <span className="mic-ring" />
        <IconMic size={34} />
      </button>

      <div className="voice-examples">
        <p>이렇게 말해 보세요</p>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            className="chip chip-ghost"
            onClick={() => {
              void handle(e);
            }}
            disabled={!!busy}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
