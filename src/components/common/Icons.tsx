// 공통 라인 아이콘 (24×24, currentColor)
const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconMic = (p: { size?: number }) => (
  <svg {...base} width={p.size ?? 22} height={p.size ?? 22}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
  </svg>
);
export const IconSearch = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const IconBack = () => (
  <svg {...base}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
export const IconClose = () => (
  <svg {...base}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const IconSwap = () => (
  <svg {...base}>
    <path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4" />
  </svg>
);
export const IconSound = ({ off }: { off?: boolean }) => (
  <svg {...base}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    {off ? (
      <path d="m16 9 5 6M21 9l-5 6" />
    ) : (
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    )}
  </svg>
);
export const IconShare = () => (
  <svg {...base}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);
export const IconMap = () => (
  <svg {...base}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);
export const IconFlag = () => (
  <svg {...base}>
    <path d="M4 22V4M4 4h13l-2 4 2 4H4" />
  </svg>
);
export const IconPin = () => (
  <svg {...base}>
    <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
export const IconDot = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" fill="currentColor" />
    <circle cx="12" cy="12" r="8" />
  </svg>
);
export const IconEye = () => (
  <svg {...base}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconList = () => (
  <svg {...base}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);
export const IconHelp = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
  </svg>
);

// 지도 핀·편의시설 칩용 작은 아이콘
const pin = { ...base, width: 14, height: 14, strokeWidth: 2.4 };
export const IconBuilding = () => (
  <svg {...pin}>
    <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4" />
  </svg>
);
export const IconStore = () => (
  <svg {...pin}>
    <path d="M5 7h14l-1 13H6zM9 7a3 3 0 0 1 6 0" />
  </svg>
);
export const IconFood = () => (
  <svg {...pin}>
    <path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 21V3c-2 0-3 2-3 5v5h3" />
  </svg>
);
export const IconCafe = () => (
  <svg {...pin}>
    <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3" />
  </svg>
);
export const IconAtm = () => (
  <svg {...pin}>
    <path d="M3 5h18v10H3zM7 19h10M12 15v4M9 10h6" />
    <circle cx="12" cy="10" r="0.6" />
  </svg>
);
export const IconPost = () => (
  <svg {...pin}>
    <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
  </svg>
);
export const IconPrint = () => (
  <svg {...pin}>
    <path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" />
  </svg>
);
