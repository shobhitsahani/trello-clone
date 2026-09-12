"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface UseSWRConfig<T> {
  revalidateOnFocus?: boolean;
  revalidateOnReconnect?: boolean;
  refreshInterval?: number;
  dedupingInterval?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  fallbackData?: T;
}

export interface SWRResponse<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: (data?: T | Promise<T> | ((current: T | undefined) => T | Promise<T>), opts?: { revalidate?: boolean }) => Promise<T | undefined>;
}

// Module-level cache for request deduplication (client-swr-dedup)
const cache = new Map<string, { data: unknown; timestamp: number; subscribers: Set<() => void>; fallbackData?: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

const DEDUPING_INTERVAL = 2000;

function getCache(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  return entry.data;
}

function getFallbackData(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  return entry.fallbackData;
}

function setCache(key: string, data: unknown, fallbackData?: unknown) {
  const entry = cache.get(key) || { data: null, timestamp: 0, subscribers: new Set() };
  entry.data = data;
  entry.timestamp = Date.now();
  if (fallbackData !== undefined) {
    entry.fallbackData = fallbackData;
  }
  cache.set(key, entry);
  entry.subscribers.forEach((cb) => cb());
}

function subscribe(key: string, cb: () => void) {
  const entry = cache.get(key) || { data: null, timestamp: 0, subscribers: new Set() };
  entry.subscribers.add(cb);
  cache.set(key, entry);
  return () => entry.subscribers.delete(cb);
}

/**
 * client-swr-dedup: Optimized SWR with automatic request deduplication
 * - Uses module-level Maps for cache and inflight requests
 * - Deduplicates requests within dedupingInterval
 * - Supports fallback data for instant rendering
 */
export function useSWR<T>(key: string | null, fetcher: () => T | Promise<T>, config: UseSWRConfig<T> = {}): SWRResponse<T> {
  const {
    revalidateOnFocus = true,
    revalidateOnReconnect = true,
    refreshInterval = 0,
    dedupingInterval = DEDUPING_INTERVAL,
    onSuccess,
    onError,
    fallbackData,
  } = config;

  // Memoize config to prevent unnecessary re-renders
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  // Use fallback data for initial render if available
  const initialData = useMemo(() => 
    key ? (getCache(key) as T | undefined) ?? (fallbackData ? getFallbackData(key) as T | undefined : undefined) : undefined
  , [key, fallbackData]);

  const [data, setData] = useState<T | undefined>(initialData);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(key ? !getCache(key) && !fallbackData : false);
  const [isValidating, setIsValidating] = useState(false);

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Use requestIdleCallback for non-critical cache updates (js-request-idle-callback)
  const scheduleCacheUpdate = useCallback((key: string, data: unknown) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => setCache(key, data));
    } else {
      setCache(key, data);
    }
  }, []);

  const executeFetcher = useCallback(
    async (isRevalidation = false) => {
      if (!key) return;
      
      const now = Date.now();
      const cached = cache.get(key);
      
      // Return cached data if within deduping interval (deduplication)
      if (!isRevalidation && cached && now - cached.timestamp < dedupingInterval) {
        return cached.data as T;
      }

      if (!isRevalidation) setIsLoading(true);
      setIsValidating(true);
      setError(null);

      // Deduplicate inflight requests (client-swr-dedup)
      let promise = inflight.get(key) as Promise<T> | undefined;
      if (!promise) {
        promise = Promise.resolve(fetcherRef.current())
          .then((result: T) => {
            // Schedule cache update during idle time
            scheduleCacheUpdate(key, result);
            configRef.current.onSuccess?.(result);
            return result;
          })
          .catch((err: Error) => {
            setError(err);
            configRef.current.onError?.(err);
            throw err;
          })
          .finally(() => {
            inflight.delete(key);
            setIsLoading(false);
            setIsValidating(false);
          });
        inflight.set(key, promise);
      }

      try {
        const result = (await promise) as T;
        setData(result);
        return result;
      } catch {
        return undefined;
      }
    },
    [key, dedupingInterval, scheduleCacheUpdate]
  );

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  const mutate = useCallback(
    async (
      newData?: T | Promise<T> | ((current: T | undefined) => T | Promise<T>),
      opts?: { revalidate?: boolean },
    ) => {
      if (!key) return undefined;
      let resolvedData: T | undefined;
      if (typeof newData === "function") {
        resolvedData = await (newData as (current: T | undefined) => T | Promise<T>)(dataRef.current);
      } else if (newData instanceof Promise) {
        resolvedData = await newData;
      } else {
        resolvedData = newData;
      }
      const skipRevalidate = opts?.revalidate === false;
      if (resolvedData !== undefined) {
        setCache(key, resolvedData);
        setData(resolvedData);
      }
      if (!skipRevalidate) {
        await executeFetcher(true);
      }
      return resolvedData;
    },
    [key, executeFetcher]
  );

  // Initial fetch and subscription
  useEffect(() => {
    if (!key) return;
    const unsubscribe = subscribe(key, () => {
      const cached = getCache(key);
      if (cached !== undefined) setData(cached as T);
    });
    executeFetcher();
    return () => {
      unsubscribe();
    };
  }, [key, executeFetcher]);

  // Focus revalidation with passive listener (client-passive-event-listeners)
  useEffect(() => {
    if (!revalidateOnFocus || !key) return;
    const onFocus = () => executeFetcher(true);
    window.addEventListener("focus", onFocus, { passive: true });
    return () => window.removeEventListener("focus", onFocus);
  }, [key, revalidateOnFocus, executeFetcher]);

  // Reconnect revalidation
  useEffect(() => {
    if (!revalidateOnReconnect || !key) return;
    const onOnline = () => executeFetcher(true);
    window.addEventListener("online", onOnline, { passive: true });
    return () => window.removeEventListener("online", onOnline);
  }, [key, revalidateOnReconnect, executeFetcher]);

  // Refresh interval
  useEffect(() => {
    if (!refreshInterval || !key) return;
    const id = setInterval(() => executeFetcher(true), refreshInterval);
    return () => clearInterval(id);
  }, [key, refreshInterval, executeFetcher]);

  return { data, error, isLoading, isValidating, mutate };
}

/**
 * useSWRInfinite with deduplication
 */
export function useSWRInfinite<T>(
  getKey: (pageIndex: number, previousPageData: T | null) => string | null,
  fetcher: (key: string) => Promise<T>,
  config: UseSWRConfig<T> = {}
) {
  const [pages, setPages] = useState<T[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [size, setSize] = useState(1);

  const fetcherRef = useRef(fetcher);
  const getKeyRef = useRef(getKey);
  const pagesRef = useRef(pages);
  useEffect(() => {
    fetcherRef.current = fetcher;
    getKeyRef.current = getKey;
    pagesRef.current = pages;
  });

  const loadPage = useCallback(
    async (index: number, isRevalidation = false) => {
      const prevPage = pagesRef.current[index - 1] ?? null;
      const key = getKeyRef.current(index, prevPage);
      if (!key) return null;

      if (!isRevalidation) setIsLoading(true);
      setIsValidating(true);
      setError(null);

      try {
        // Check cache first for deduplication
        const cached = getCache(key) as { data: T } | null;
        const now = Date.now();
        if (!isRevalidation && cached && now - (cache.get(key)?.timestamp ?? 0) < DEDUPING_INTERVAL) {
          setPages((prev) => {
            const next = [...prev];
            next[index] = cached.data;
            return next;
          });
          return cached.data;
        }

        const data = await fetcherRef.current(key);
        setCache(key, data);
        setPages((prev) => {
          const next = [...prev];
          next[index] = data;
          return next;
        });
        return data;
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
        setIsValidating(false);
      }
    },
    []
  );

  const mutate = useCallback(async () => {
    for (let i = 0; i < size; i++) {
      await loadPage(i, true);
    }
  }, [size, loadPage]);

  useEffect(() => {
    let mounted = true;
    async function loadInitial() {
      for (let i = 0; i < size; i++) {
        if (!mounted) return;
        await loadPage(i);
      }
    }
    loadInitial();
    return () => { mounted = false; };
  }, [size, loadPage]);

  return { data: pages, error, isLoading, isValidating, mutate, size, setSize };
}

/**
 * Preload data into SWR cache (bundle-preload)
 * Use for hover/focus preloading
 */
export function preloadSWR<T>(key: string, fetcher: () => Promise<T>) {
  if (cache.has(key)) return;
  const promise = fetcher();
  inflight.set(key, promise);
  promise.then((result) => {
    setCache(key, result);
    inflight.delete(key);
  }).catch(() => {
    inflight.delete(key);
  });
}

/**
 * Clear all SWR cache (useful for logout)
 */
export function clearSWRCache() {
  cache.clear();
  inflight.clear();
}