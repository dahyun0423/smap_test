import type { ReactNode } from 'react';

import {
  IconAtm,
  IconBuilding,
  IconCafe,
  IconFood,
  IconPost,
  IconPrint,
  IconStore,
} from '@/components/common/Icons';
import type { FacCat } from '@/utils/facilities';

/** 지도 핀·필터 칩에 쓰는 편의시설 종류별 아이콘 */
export const FAC_ICON: Record<FacCat | 'building', ReactNode> = {
  building: <IconBuilding />,
  store: <IconStore />,
  food: <IconFood />,
  cafe: <IconCafe />,
  atm: <IconAtm />,
  post: <IconPost />,
  print: <IconPrint />,
};
