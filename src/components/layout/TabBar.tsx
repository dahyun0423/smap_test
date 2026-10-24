// 홈 하단 탭바 (지도 · 말로 길 묻기 · 제보). 가운데 파인 배경은 public/ui/tabbar-notch.svg
const ui = (f: string) => `${import.meta.env.BASE_URL}ui/${f}`;

interface Props {
  onMap: () => void;
  onVoice: () => void;
  onReport: () => void;
}

export default function TabBar({ onMap, onVoice, onReport }: Props) {
  return (
    <nav className="tabbar" aria-label="메뉴">
      <div className="tabbar-bg" aria-hidden="true">
        <span className="tabbar-side tabbar-side-l" />
        <img className="tabbar-notch" src={ui('tabbar-notch.svg')} alt="" />
        <span className="tabbar-side tabbar-side-r" />
      </div>
      <button className="tab-item tab-item-l" onClick={onMap}>
        <img src={ui('tab-map.svg')} alt="" width={24} height={24} />
        <span>지도</span>
      </button>
      <button className="tab-voice" onClick={onVoice}>
        <span className="tab-voice-circle" aria-hidden="true">
          <img
            className="tab-voice-bg"
            src={ui('tab-mic-circle.svg')}
            alt=""
            width={82}
            height={82}
          />
          <img className="tab-voice-mic" src={ui('tab-mic.svg')} alt="" width={17} height={23} />
        </span>
        <span className="tab-voice-label">말로 길 묻기</span>
      </button>
      <button className="tab-item tab-item-r" onClick={onReport}>
        <img src={ui('tab-report.svg')} alt="" width={24} height={24} />
        <span>제보</span>
      </button>
    </nav>
  );
}
