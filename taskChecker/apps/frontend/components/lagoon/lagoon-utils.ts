/* Lagoon helpers — ported from treloo-joyful-design.
   Tone mapping bridges Treloo's free-form label colors onto the backend's
   fixed priority field; checklist + label overrides persist per-task in
   localStorage (the API has no checklist/label fields). */

import type { Priority } from "@/lib/utils";

export type LagoonTone = "teal" | "coral" | "ocean";

export const LAGOON_TONES: LagoonTone[] = ["teal", "coral", "ocean"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Backend priority -> joyful label tone. Mirrors Treloo's label colors. */
export function toneForPriority(priority: Priority): LagoonTone | null {
  switch (priority) {
    case "critical":
    case "high":
      return "coral";
    case "medium":
      return "ocean";
    case "low":
      return "teal";
    default:
      return null;
  }
}

/** Default pill text for a priority (Treloo shows a label pill per card). */
export function defaultLabelForPriority(priority: Priority): string | null {
  if (priority === "none") return null;
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export interface LagoonCheckItem {
  id: number;
  text: string;
  done: boolean;
}

export interface LagoonTaskMeta {
  /** Label text override. `undefined` = fall back to priority default. */
  label?: string;
  /** Label color override. `undefined` = fall back to priority tone. */
  tone?: LagoonTone;
  checklist: LagoonCheckItem[];
}

const META_PREFIX = "lagoon.task.meta.v1.";

function readMeta(taskId: string): LagoonTaskMeta {
  if (typeof window === "undefined") return { checklist: [] };
  try {
    const raw = window.localStorage.getItem(META_PREFIX + taskId);
    if (!raw) return { checklist: [] };
    const parsed = JSON.parse(raw) as Partial<LagoonTaskMeta>;
    return {
      label: typeof parsed.label === "string" ? parsed.label : undefined,
      tone:
        parsed.tone === "teal" || parsed.tone === "coral" || parsed.tone === "ocean"
          ? parsed.tone
          : undefined,
      checklist: Array.isArray(parsed.checklist)
        ? parsed.checklist.filter(
            (c): c is LagoonCheckItem =>
              typeof c === "object" &&
              c !== null &&
              typeof (c as LagoonCheckItem).text === "string",
          )
        : [],
    };
  } catch {
    return { checklist: [] };
  }
}

function writeMeta(taskId: string, meta: LagoonTaskMeta): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(META_PREFIX + taskId, JSON.stringify(meta));
  } catch {
    // storage unavailable — session-only meta
  }
}

export function loadLagoonMeta(taskId: string): LagoonTaskMeta {
  return readMeta(taskId);
}

export function saveLagoonLabel(taskId: string, label: string, tone: LagoonTone | undefined): void {
  const meta = readMeta(taskId);
  meta.label = label;
  if (tone) meta.tone = tone;
  else delete meta.tone;
  writeMeta(taskId, meta);
}

export function saveLagoonChecklist(taskId: string, checklist: LagoonCheckItem[]): void {
  const meta = readMeta(taskId);
  meta.checklist = checklist;
  writeMeta(taskId, meta);
}

export function clearLagoonMeta(taskId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(META_PREFIX + taskId);
  } catch {
    // noop
  }
}

/** Effective pill for a card: stored override wins, else priority default. */
export function effectiveLabel(
  priority: Priority,
  meta: LagoonTaskMeta,
): { text: string; tone: LagoonTone } | null {
  const text = meta.label !== undefined ? meta.label : defaultLabelForPriority(priority);
  if (!text || !text.trim()) return null;
  const tone = meta.tone ?? toneForPriority(priority) ?? "ocean";
  return { text: text.trim(), tone };
}

/** "2026-09-25T…" -> "2026-09-25" for day-granularity comparisons. */
export function toYmd(iso: string | null | undefined): string | null {
  if (!iso || iso.length < 10) return null;
  return iso.slice(0, 10);
}

export function todayYmd(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export interface DueBadge {
  text: string;
  status: "overdue" | "today" | "future" | "plain";
}

/** Joyful due badge — ported from Treloo's dueBadge(). */
export function lagoonDueBadge(dueYmd: string, today: string | null): DueBadge {
  const parts = dueYmd.split("-").map(Number);
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const text = `${MONTHS[m - 1] ?? ""} ${d}`;
  if (!today) return { text, status: "plain" };
  if (dueYmd < today) return { text, status: "overdue" };
  if (dueYmd === today) return { text: "Today", status: "today" };
  return { text, status: "future" };
}

/** Suggest a short uppercase key from a project name, e.g. "Edge API" -> "EDGE". */
export function suggestLagoonKey(name: string): string {
  return name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4);
}

/** "Arjun Mehta" -> "AM". Single word -> first two letters. */
export function lagoonInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return `${(parts[0] ?? "?")[0] ?? ""}${(parts[parts.length - 1] ?? "?")[0] ?? ""}`.toUpperCase();
}

const LAGOON_AVATAR_TONES = ["#0c66e4", "#0d9488", "#e56910", "#7c3aed", "#db2777", "#059669"];

/** Stable avatar background hue from any seed string. */
export function lagoonAvatarTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return LAGOON_AVATAR_TONES[h % LAGOON_AVATAR_TONES.length] ?? "#0c66e4";
}
