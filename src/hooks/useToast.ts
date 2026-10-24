import { useCallback, useRef, useState } from 'react';

/** 화면 아래 잠깐 뜨는 알림 — 3.2초 뒤 사라진다 */
export default function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number>(0);

  const toast = useCallback((msg: string) => {
    setMessage(msg);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 3200);
  }, []);

  return { message, toast };
}
