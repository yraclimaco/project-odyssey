// Small stroke icons, always paired with visible text (decorative, so aria-hidden).
import type { ReactNode } from 'react';

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="icon"
    >
      {children}
    </svg>
  );
}

export const IconLayers = () => (
  <Svg><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="m2 13 10 5 10-5" /></Svg>
);
export const IconRoute = () => (
  <Svg><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" /></Svg>
);
export const IconSave = () => (
  <Svg><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></Svg>
);
export const IconPlus = () => (
  <Svg><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconClose = () => (
  <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>
);
export const IconPin = () => (
  <Svg><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></Svg>
);
export const IconFlag = () => (
  <Svg><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></Svg>
);
export const IconFit = () => (
  <Svg><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Svg>
);
export const IconChevron = ({ open }: { open: boolean }) => (
  <Svg size={16}>{open ? <path d="m6 15 6-6 6 6" /> : <path d="m6 9 6 6 6-6" />}</Svg>
);
export const IconInfo = () => (
  <Svg size={16}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>
);
export const IconNote = () => (
  <Svg><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></Svg>
);
export const IconTrash = () => (
  <Svg size={16}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Svg>
);
export const IconRefresh = () => (
  <Svg size={16}><path d="M20 12a8 8 0 1 1-2.3-5.7L20 8" /><path d="M20 3v5h-5" /></Svg>
);
export const IconEdit = () => (
  <Svg size={16}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></Svg>
);
export const IconCheck = () => (
  <Svg size={16}><path d="m5 12 5 5 9-10" /></Svg>
);
