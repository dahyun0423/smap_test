import { useCallback, useEffect, useRef, useState } from 'react';

// 브라우저 음성 인식 (Web Speech API, ko-KR). 표준 타입이 없어 필요한 만큼만 선언한다.
interface SR extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const SRCtor: (new () => SR) | undefined =
  typeof window !== 'undefined'
    ? (((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as
        (new () => SR) | undefined)
    : undefined;

export const speechSupported = !!SRCtor;

/** 말하기 시작/중지와 중간·최종 인식 결과. 최종 문장이 나오면 onFinal 호출 */
export default function useSpeechRecognition(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<SR | null>(null);
  const cb = useRef(onFinal);
  useEffect(() => {
    cb.current = onFinal;
  }, [onFinal]);

  const start = useCallback(() => {
    if (!SRCtor) {
      setError('이 브라우저는 음성 인식을 지원하지 않아요. 크롬이나 사파리에서 열어주세요.');
      return;
    }
    const r = new SRCtor();
    r.lang = 'ko-KR';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      setInterim(text);
      if (final) cb.current(text);
    };
    r.onerror = (e) =>
      setError(
        e.error === 'not-allowed'
          ? '마이크 권한을 허용해 주세요.'
          : e.error === 'no-speech'
            ? '말소리가 들리지 않았어요. 다시 눌러 말해 주세요.'
            : '음성 인식 중 문제가 생겼어요.'
      );
    r.onend = () => setListening(false);
    ref.current = r;
    setError(null);
    setInterim('');
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => {
    ref.current?.stop();
    setListening(false);
  }, []);
  useEffect(() => () => ref.current?.stop(), []);
  return { listening, interim, error, start, stop };
}
