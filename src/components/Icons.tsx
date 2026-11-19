import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconUpload = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
  </svg>
);

export const IconSettings = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.22.6.79 1 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

/** Pushpin used for pinned conversations. */
export const IconPin = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9.2 4h5.6l-.9 4.6 2.8 2.8v1.8H7.3v-1.8l2.8-2.8L9.2 4Z" />
    <path d="M12 13.2V20" />
  </svg>
);

export const IconMore = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="12" r="1" fill="currentColor" />
  </svg>
);

export const IconSend = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.5 11.2 19.4 5a.7.7 0 0 1 .93.93L14.1 20.2a.7.7 0 0 1-1.3-.04l-2.2-6.1-6.1-2.2a.7.7 0 0 1 0-1.3Z" />
    <path d="m10.8 13.5 4.3-4.3" />
  </svg>
);

export const IconStop = (p: P) => (
  <svg {...base} {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 11a8 8 0 1 1-2.3-5.6L20 7.5" />
    <path d="M20 3v4.5h-4.5" />
  </svg>
);

export const IconX = (p: P) => (
  <svg {...base} {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconBook = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 16.5v-11Z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5v-11Z" />
  </svg>
);

export const IconChevronLeft = (p: P) => (
  <svg {...base} {...p}>
    <path d="m14.5 5-7 7 7 7" />
  </svg>
);

export const IconMenu = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IconCopy = (p: P) => (
  <svg {...base} {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const IconAlert = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16.5h.01" />
  </svg>
);

export const IconSparkles = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3.5 13.7 8l4.5 1.7-4.5 1.7L12 16l-1.7-4.6L5.8 9.7 10.3 8 12 3.5Z" />
    <path d="M18.5 15.5 19.3 18l2.2.8-2.2.8-.8 2.4-.8-2.4-2.2-.8 2.2-.8.8-2.5Z" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base} {...p}>
    <path d="m9.5 5 7 7-7 7" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

/** Flat mark: one spoken line inside a speech box, drawn in the current colour. */
export const IconLogo = (p: P) => (
  <svg viewBox="0 0 40 40" width={40} height={40} fill="none" {...p}>
    <path
      d="M11 9.5h18a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-9.6l-5.6 4.2a.8.8 0 0 1-1.3-.64V27.5H11a3 3 0 0 1-3-3v-12a3 3 0 0 1 3-3Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M15 16.5h10M15 21h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const IconEdit = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L17 5a2.1 2.1 0 0 0-3 0L3.5 15.5V20Z" />
    <path d="M13.5 6.5 17.5 10.5" />
  </svg>
);

/** "Collapse into memory": stacked lines with an arrow pointing down. */
export const IconCompress = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 5.5h16M4 9.5h16" />
    <path d="M12 12.5v7m0 0-3.2-3.2M12 19.5l3.2-3.2" />
  </svg>
);

/** Backup: a box with a lid. */
export const IconArchive = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7.5h16v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-11Z" />
    <path d="M3 4.5h18v3H3zM9.5 11.5h5" />
  </svg>
);

/** Picture / background image. */
export const IconImage = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.4" />
    <circle cx="9" cy="10.2" r="1.6" />
    <path d="M4.2 17.4l4.6-4.2 3.1 2.8 3.4-3.4 4.4 4.4" />
  </svg>
);

/** Per-conversation settings (title, context window, background). */
export const IconSliders = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.1" />
    <circle cx="9" cy="17" r="2.1" />
  </svg>
);

/** Download to this device. */
export const IconDownload = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 4v11m0 0-4.2-4.2M12 15l4.2-4.2" />
    <path d="M4.5 17v2.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V17" />
  </svg>
);
