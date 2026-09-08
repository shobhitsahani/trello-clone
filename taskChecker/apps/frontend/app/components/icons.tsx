import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "board"
  | "inbox"
  | "search"
  | "bell"
  | "admin"
  | "plug"
  | "plus"
  | "chev"
  | "chevR"
  | "check"
  | "comment"
  | "clip"
  | "grip"
  | "users"
  | "key"
  | "webhook"
  | "list"
  | "zap"
  | "export"
  | "x"
  | "send";

const G: Record<IconName, ReactElement> = {
  board: (
    <g>
      <rect x="3.5" y="4" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="16" width="7" height="4.5" rx="1.6" />
    </g>
  ),
  inbox: (
    <g>
      <path d="M4 5h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 13h4.2l1.4 2.2h4.8L16 13h4" />
    </g>
  ),
  search: (
    <g>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m19.5 19.5-3.6-3.6" />
    </g>
  ),
  bell: (
    <g>
      <path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.6 1.9H4.4z" />
      <path d="M10 20.4a2 2 0 0 0 4 0" />
    </g>
  ),
  admin: (
    <g>
      <path d="M12 3 5 5.8v4.9c0 4.6 3 8.2 7 10.3 4-2.1 7-5.7 7-10.3V5.8z" />
      <path d="m9.2 11.4 2 2 3.6-3.8" />
    </g>
  ),
  plug: (
    <g>
      <path d="M9 3v4" />
      <path d="M15 3v4" />
      <path d="M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0z" />
    </g>
  ),
  plus: (
    <g>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </g>
  ),
  chev: <path d="m6 9 6 6 6-6" />,
  chevR: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  comment: <path d="M4 5h16v11H9.5L5.2 19.6V16H4z" />,
  clip: <path d="m7 12.4 5.5-5.5a3.2 3.2 0 0 1 4.6 4.6l-6 6a2 2 0 0 1-2.8-2.8l5.9-5.9" />,
  grip: (
    <g fill="currentColor" stroke="none">
      <circle cx="8.5" cy="6" r="1.1" />
      <circle cx="15.5" cy="6" r="1.1" />
      <circle cx="8.5" cy="12" r="1.1" />
      <circle cx="15.5" cy="12" r="1.1" />
      <circle cx="8.5" cy="18" r="1.1" />
      <circle cx="15.5" cy="18" r="1.1" />
    </g>
  ),
  users: (
    <g>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3.5 19.5c.6-3.4 2.9-4.9 5.5-4.9s4.9 1.5 5.5 4.9" />
      <path d="M15.5 5.6a3.4 3.4 0 0 1 0 6.5" />
      <path d="M17.6 14.9c1.7.7 2.6 2.2 2.9 4.6" />
    </g>
  ),
  key: (
    <g>
      <circle cx="7.5" cy="12" r="3.5" />
      <path d="M10.2 10.2 20 20" />
      <path d="M16 16l2.4 2.4" />
    </g>
  ),
  webhook: (
    <g>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2" />
      <path d="M12 19v2" />
      <path d="M5.6 7.5 7.2 9.1" />
      <path d="M16.8 14.9l1.6 1.6" />
    </g>
  ),
  list: (
    <g>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </g>
  ),
  zap: (
    <g>
      <path d="M13 3 5 13.5h6L11 21l8-10.5h-6z" />
    </g>
  ),
  export: (
    <g>
      <path d="M12 4v11" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 20h16" />
    </g>
  ),
  x: (
    <g>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </g>
  ),
  send: (
    <g>
      <path d="M5 12h14" />
      <path d="m13 7 5 5-5 5" />
    </g>
  ),
};

export function I({
  name,
  size = 18,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {G[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Named icon components used by the real-time page components.         */
/* ------------------------------------------------------------------ */

type NamedProps = { size?: number; className?: string };

const n = (children: ReactElement) =>
  function NamedIcon({ size = 16, className }: NamedProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };

export const IconFlowMark = n(<><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" /></>);
export const IconMail = n(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>);
export const IconLock = n(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>);
export const IconUser = n(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const IconBuilding = n(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 21V6h6v15" /></>);
export const IconEye = n(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEyeOff = n(<><path d="M9.88 9.88A3 3 0 0 0 12 15M6.6 6.6A10.4 10.4 0 0 0 2 12s3.5 7 10 7a10.5 10.5 0 0 0 5.4-1.6M9.9 4.2A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a10.6 10.6 0 0 1-1.7 2.7M2 2l20 20" /></>);
export const IconArrowRight = n(<><path d="M5 12h14M13 5l7 7-7 7" /></>);
export const IconArrowLeft = n(<><path d="M19 12H5M12 19l-7-7 7-7" /></>);
export const IconUsers = n(<><circle cx="9" cy="8" r="4" /><path d="M2 21a8 8 0 0 1 16 0M20 8a3 3 0 0 0-4-3M22 21a8 8 0 0 0-6-7" /></>);
export const IconPlus = n(<><path d="M12 5v14M5 12h14" /></>);
export const IconSearch = n(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>);
export const IconFilter = n(<><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" /></>);
export const IconFolder = n(<><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" /></>);
export const IconFile = n(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></>);
export const IconClock = n(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconPulse = n(<><path d="M22 12h-4l-3 9-6-18-3 9H2" /></>);
export const IconMessageSquare = n(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></>);
export const IconChevronRight = n(<><path d="m9 18 6-6-6-6" /></>);
export const IconEdit = n(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" /></>);
export const IconTrash = n(<><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></>);
export const IconX = n(<><path d="M18 6 6 18M6 6l12 12" /></>);
export const IconCheck = n(<><path d="M20 6 9 17l-5-5" /></>);
export const IconCreditCard = n(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>);
export const IconWebhook = n(<><path d="M18 16h-6a4 4 0 0 1-8 0h-2" /><path d="M6 8h6a4 4 0 0 1 8 0h2" /><circle cx="12" cy="12" r="1" /><circle cx="6" cy="16" r="1" /><circle cx="18" cy="8" r="1" /></>);
export const IconFileText = n(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>);
export const IconShield = n(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></>);
export const IconSettings = n(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);