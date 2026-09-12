/** Shared frontend utilities. */

/** Class-name joiner — falsy values are dropped. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** "3 hours ago" style relative time. */
export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Deterministic hue from a string (avatar tints, project chips). */
export function hueFrom(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/**
 * Timestamp in the *viewer's* local timezone (see `lib/utils.ts`).
 * Kept in sync for app-router pages: no explicit `timeZone` so the
 * browser renders the reader's own zone.
 */
export function formatChatTime(
  date: string | Date,
  now = Date.now(),
): { absolute: string; relative: string; title: string } {
  const d = typeof date === "string" ? new Date(date) : date;
  const relative = timeAgo(d);
  if (Number.isNaN(d.getTime())) return { absolute: "", relative, title: "" };
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  let absolute: string;
  if (dayDiff <= 0) {
    absolute = time;
  } else if (dayDiff === 1) {
    absolute = `Yesterday ${time}`;
  } else if (d.getFullYear() === today.getFullYear()) {
    absolute = `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
  } else {
    absolute = `${d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}, ${time}`;
  }
  let title: string;
  try {
    title = d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZoneName: "short",
    });
  } catch {
    title = d.toLocaleString();
  }
  return { absolute, relative, title };
}
