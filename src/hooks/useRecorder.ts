import { useEffect, useRef, useState } from 'react';

const MAX_REC_MS = 8000;

/** MediaRecorder를 쓸 수 있는 브라우저인지 */
export const canRecord =
  typeof window !== 'undefined' &&
  'MediaRecorder' in window &&
  !!navigator.mediaDevices?.getUserMedia;

/** 서버 음성인식용 녹음 — 버튼으로 멈추거나 8초 뒤 자동으로 멈춘다 */
export default function useRecorder(onAudio: (b: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef(0);
  const stop = () => {
    clearTimeout(timer.current);
    if (rec.current?.state === 'recording') rec.current.stop();
    setRecording(false);
  };
  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunks.length) onAudio(new Blob(chunks, { type: r.mimeType || 'audio/webm' }));
      };
      rec.current = r;
      r.start();
      setRecording(true);
      timer.current = window.setTimeout(stop, MAX_REC_MS);
    } catch {
      setError('마이크 권한을 허용해 주세요.');
    }
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { recording, error, start, stop };
}
