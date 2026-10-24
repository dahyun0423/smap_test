// 음성 안내 (Web Speech API 음성 합성, ko-KR)
let muted = false;
export const setMuted = (v: boolean) => {
  muted = v;
  if (v) speechSynthesis?.cancel();
};
export const isMuted = () => muted;

/** 문장을 읽어 준다 (이전 안내는 끊는다) */
export function speak(text: string) {
  if (muted || typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 1.05;
  const ko = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ko'));
  if (ko) u.voice = ko;
  speechSynthesis.speak(u);
}
