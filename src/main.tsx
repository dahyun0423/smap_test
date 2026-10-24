import { createRoot } from 'react-dom/client';

import { loadShared } from '@/data/sharedEdits';
import '@/styles/index.css';

// StrictMode 미사용: 개발 모드의 이중 마운트가 360 뷰어의 사진 요청을 취소해 화면이 멈춘다.
// 길 그래프는 모듈 로드 시점에 한 번 만들어지므로, 공유 수정값을 먼저 받은 뒤 App을 불러온다.
loadShared().finally(async () => {
  const { default: App } = await import('@/App');
  createRoot(document.getElementById('root')!).render(<App />);
});
