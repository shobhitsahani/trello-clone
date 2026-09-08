/* Hand-drawn icon set — stroke-based, 24px grid, currentColor. */

import type { ReactNode } from "react";

type IconProps = {
  size?: number;
  className?: string;
  title?: string;
};

function Ico({
  size = 16,
  className,
  title,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={!title}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconWork(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M3 6h7l2 3h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
    </Ico>
  );
}

export function IconBoard(p: IconProps) {
  return (
    <Ico {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v9" />
    </Ico>
  );
}

export function IconFolder(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </Ico>
  );
}

export function IconUsers(p: IconProps) {
  return (
    <Ico {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
      <path d="M16 5.6a3 3 0 0 1 0 5.2M17.6 14.9c1.6.7 2.6 2 2.9 4.1" />
    </Ico>
  );
}

export function IconPulse(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
    </Ico>
  );
}

export function IconBell(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 5 1.6 6 1.6 6H4.4S6 14.5 6 9.5Z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </Ico>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Ico {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </Ico>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <Ico {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </Ico>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M12 5v14M5 12h14" />
    </Ico>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="m6 9 6 6 6-6" />
    </Ico>
  );
}

export function IconChevronRight(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="m9 6 6 6-6 6" />
    </Ico>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Ico>
  );
}

export function IconX(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Ico>
  );
}
export function IconArrowRight(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </Ico>
  );
}

export function IconMoreHorizontal(p: IconProps) {
  return (
    <Ico {...p}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </Ico>
  );
}

export function IconLink(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M10 14a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 10a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </Ico>
  );
}

export function IconCopy(p: IconProps) {
  return (
    <Ico {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Ico>
  );
}

export function IconKey(p: IconProps) {
  return (
    <Ico {...p}>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 8-8M15.5 7.5l2 2M18.5 4.5l2 2" />
    </Ico>
  );
}

export function IconWebhook(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M8.5 9.5 12 3.5l3.5 6" />
      <circle cx="18" cy="16.5" r="3.2" />
      <circle cx="6" cy="16.5" r="3.2" />
      <path d="M12 3.5 15.5 12M6 16.5h5.5M12.5 16.5h2.3M8.4 14.1 5 9.5" />
    </Ico>
  );
}

export function IconShield(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M12 3 5 5.5v5c0 4.6 3 8 7 10 4-2 7-5.4 7-10v-5L12 3Z" />
      <path d="m9 11.5 2 2 4-4.5" />
    </Ico>
  );
}

export function IconZap(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
    </Ico>
  );
}

export function IconMail(p: IconProps) {
  return (
    <Ico {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Ico>
  );
}

export function IconClock(p: IconProps) {
  return (
    <Ico {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Ico>
  );
}

export function IconTrash(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6A1.5 1.5 0 0 0 16.5 19l1-12" />
    </Ico>
  );
}

export function IconAlert(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M12 4 3 19.5h18L12 4Z" />
      <path d="M12 10v4.2M12 17.2v.1" />
    </Ico>
  );
}

export function IconRefresh(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 3v4h-4" />
    </Ico>
  );
}

export function IconCommand(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" />
    </Ico>
  );
}

export function IconLayers(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </Ico>
  );
}

export function IconFile(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4" />
    </Ico>
  );
}

export function IconSend(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="m4 11 16-7-7 16-2.5-6.5L4 11Z" />
    </Ico>
  );
}

export function IconMessageSquare(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Ico>
  );
}

export function IconRotateCw(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 3v4h-4" />
    </Ico>
  );
}

export function IconTrendingUp(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M16 6l4 4-4 4M8 18l6-6 6 6" />
    </Ico>
  );
}

export function IconDatabase(p: IconProps) {
  return (
    <Ico {...p}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v9a8 3 0 0 0 16 0V6" />
      <path d="M4 15a8 3 0 0 1 16 0" />
    </Ico>
  );
}

export function IconAlertTriangle(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M12 4 3 19.5h18L12 4Z" />
      <path d="M12 10v4.2M12 17.2v.1" />
    </Ico>
  );
}

export function IconDownload(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M12 3v12M8 11l4 4 4-4M20 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2" />
    </Ico>
  );
}

export function IconUser(p: IconProps) {
  return (
    <Ico {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </Ico>
  );
}

export function IconBuilding(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M4 22h16v-5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v5Z" />
      <path d="M8 15h8v7H8v-7Z" />
      <path d="M8 7h8v8H8V7Z" />
    </Ico>
  );
}

export function IconEye(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Ico>
  );
}

export function IconEyeOff(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <path d="M10 10l4 4M14 10l-4 4" />
      <path d="M9 9l1.5 1.5" />
    </Ico>
  );
}

export function IconGrip(p: IconProps) {
  return (
    <Ico {...p}>
      <circle cx="9" cy="5" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="19" r="1" />
    </Ico>
  );
}

export function IconPaperclip(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M12 3v12M19 12H5" />
      <path d="M8 16c0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5" />
    </Ico>
  );
}

export function IconExternalLink(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </Ico>
  );
}

export function IconArrowLeft(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M12 19l-7-7 7-7" />
      <path d="M19 12H5" />
    </Ico>
  );
}

export function IconEdit(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
    </Ico>
  );
}

export function IconCreditCard(p: IconProps) {
  return (
    <Ico {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M2 14h20" />
    </Ico>
  );
}

export function IconFileText(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </Ico>
  );
}

export function IconFilter(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M12 22l5-5-5-5H4v14h10Z" />
      <path d="M12 2v10" />
    </Ico>
  );
}

export function IconLock(p: IconProps) {
  return (
    <Ico {...p}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Ico>
  );
}

export function IconLogout(p: IconProps) {
  return (
    <Ico {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </Ico>
  );
}

export function IconAlertCircle(p: IconProps) {
  return (
    <Ico {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 9.5v3M12 16a1.6 1.6 0 0 1 0 1.5" />
    </Ico>
  );
}

export function IconInfo(p: IconProps) {
  return (
    <Ico {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8.5a1.5 1.5 0 0 1 0 1.4M12 12.5v5" />
    </Ico>
  );
}

/** The TeamFlow mark: a conduit with a light drop travelling through. */
export function IconFlowMark({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        x="2.5"
        y="9"
        width="19"
        height="6"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}