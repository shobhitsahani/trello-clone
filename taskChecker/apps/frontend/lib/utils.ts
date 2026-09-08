/* Tiny shared helpers — no React dep, safe for server + client. */

export type ClassVal = string | false | null | undefined;

/** join conditional class names */
export function cx(...vals: ClassVal[]): string {
  return vals.filter(Boolean).join(" ");
}

/** initials from a full name */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return (((parts[0] as string)[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export const STATUS_META = {
  backlog: { label: "Backlog", color: "var(--st-backlog)" },
  todo: { label: "To do", color: "var(--st-ready)" },
  in_progress: { label: "In progress", color: "var(--st-progress)" },
  done: { label: "Done", color: "var(--st-done)" },
} as const;

export type TaskStatus = keyof typeof STATUS_META;

export const PRIORITY_META = {
  critical: { label: "Critical", color: "var(--p-urgent)", rank: 0 },
  high: { label: "High", color: "var(--p-high)", rank: 1 },
  medium: { label: "Medium", color: "var(--p-medium)", rank: 2 },
  low: { label: "Low", color: "var(--p-low)", rank: 3 },
  none: { label: "No priority", color: "var(--paper-3)", rank: 4 },
} as const;

export type Priority = keyof typeof PRIORITY_META;

export const ROLE_META = {
  owner: { label: "Owner", color: "var(--accent-hi)" },
  admin: { label: "Admin", color: "var(--info)" },
  member: { label: "Member", color: "var(--paper-2)" },
  viewer: { label: "Viewer", color: "var(--paper-3)" },
} as const;

export type Role = keyof typeof ROLE_META;

export function hueFrom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/** compact relative time, e.g. "4h", "2d", "now" */
export function timeAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 45) return "now";
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const dy = Math.floor(hr / 24);
  if (dy < 30) return `${dy}d`;
  const mo = Math.floor(dy / 30);
  return `${mo}mo`;
}

/** absolute short clock time like "09:41" */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** full day label like "Aug 26" */
export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** highlight a query within a string for search results */
export function splitOnQuery(text: string, query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [text];
  const lower = text.toLowerCase();
  const out: string[] = [];
  let i = 0;
  while (true) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      out.push(text.slice(i));
      break;
    }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(text.slice(idx, idx + q.length));
    i = idx + q.length;
  }
  return out;
}

/* ================================================================
   JavaScript Performance Optimizations (js-*)
   ================================================================ */

/**
 * js-early-exit: Return early from functions to avoid unnecessary computation
 */
export function findFirst<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
  for (const item of arr) {
    if (predicate(item)) return item;
  }
  return undefined;
}

/**
 * js-combine-iterations: Combine multiple filter/map into one loop
 * Instead of arr.filter(f).map(m), do single pass
 */
export function filterMap<T, U>(arr: T[], fn: (item: T) => U | null): U[] {
  const out: U[] = [];
  for (const item of arr) {
    const result = fn(item);
    if (result !== null) out.push(result);
  }
  return out;
}

/**
 * js-combine-iterations: Filter and count in single pass
 */
export function filterCount<T>(arr: T[], predicate: (item: T) => boolean): { filtered: T[]; count: number } {
  const filtered: T[] = [];
  let count = 0;
  for (const item of arr) {
    if (predicate(item)) {
      filtered.push(item);
      count++;
    }
  }
  return { filtered, count };
}

/**
 * js-length-check-first: Check array length before expensive comparison
 */
export function arraysEqual<T>(a: T[], b: T[], equals: (x: T, y: T) => boolean = (x, y) => x === y): boolean {
  if (a.length !== b.length) return false; // js-length-check-first
  for (let i = 0; i < a.length; i++) {
    if (!equals(a[i] as T, b[i] as T)) return false; // js-early-exit
  }
  return true;
}

/**
 * js-set-map-lookups: Use Set/Map for O(1) lookups instead of array.includes
 */
export function createLookupMap<T, K>(arr: T[], keyFn: (item: T) => K): Map<K, T> {
  const map = new Map<K, T>();
  for (const item of arr) {
    map.set(keyFn(item), item);
  }
  return map;
}

export function createLookupSet<T>(arr: T[]): Set<T> {
  return new Set(arr);
}

/**
 * js-cache-function-results: Cache function results in module-level Map
 * Use for expensive computations that are called repeatedly with same args
 */
export function memoize<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  keyFn?: (...args: Args) => string
): (...args: Args) => R {
  const cache = new Map<string, R>();
  return (...args: Args) => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * js-cache-storage: Cache localStorage/sessionStorage reads
 */
const storageCache = new Map<string, unknown>();

export function getCachedStorage(key: string, storage: Storage = localStorage): string | null {
  const cached = storageCache.get(key);
  if (cached !== undefined) return cached as string | null;
  const value = storage.getItem(key);
  storageCache.set(key, value);
  return value;
}

export function setCachedStorage(key: string, value: string, storage: Storage = localStorage): void {
  storage.setItem(key, value);
  storageCache.set(key, value);
}

export function removeCachedStorage(key: string, storage: Storage = localStorage): void {
  storage.removeItem(key);
  storageCache.delete(key);
}

/**
 * js-tosorted-immutable: Use toSorted() for immutability (modern JS)
 */
export function sortedCopy<T>(arr: T[], compareFn?: (a: T, b: T) => number): T[] {
  return [...arr].sort(compareFn);
}

/**
 * js-flatmap-filter: Use flatMap to map and filter in one pass
 */
export function flatMapFilter<T, U>(arr: T[], fn: (item: T) => U | null): U[] {
  return arr.flatMap(item => {
    const result = fn(item);
    return result === null ? [] : [result];
  });
}

/**
 * js-min-max-loop: Use loop for min/max instead of sort
 */
export function findMin<T>(arr: T[], valueFn: (item: T) => number): T | undefined {
  if (arr.length === 0) return undefined;
  const first = arr[0] as T;
  let minItem = first;
  let minValue = valueFn(first);
  for (let i = 1; i < arr.length; i++) {
    const item = arr[i] as T;
    const value = valueFn(item);
    if (value < minValue) {
      minValue = value;
      minItem = item;
    }
  }
  return minItem;
}

export function findMax<T>(arr: T[], valueFn: (item: T) => number): T | undefined {
  if (arr.length === 0) return undefined;
  const first = arr[0] as T;
  let maxItem = first;
  let maxValue = valueFn(first);
  for (let i = 1; i < arr.length; i++) {
    const item = arr[i] as T;
    const value = valueFn(item);
    if (value > maxValue) {
      maxValue = value;
      maxItem = item;
    }
  }
  return maxItem;
}

/**
 * js-hoist-regexp: Hoist RegExp creation outside loops
 */
const QUERY_SPLIT_REGEXP = /[^\s]+/g;

export function extractKeywords(query: string): string[] {
  return query.match(QUERY_SPLIT_REGEXP) ?? [];
}

/**
 * Debounce function for limiting rate of calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function for limiting rate of calls
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}