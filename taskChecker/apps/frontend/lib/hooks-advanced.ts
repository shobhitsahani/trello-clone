"use client";

import { useRef, useEffect, useCallback, useState } from "react";

/**
 * advanced-use-latest: useLatest for stable callback refs
 * Returns a ref that always points to the latest value
 * Useful for event handlers that need current values without re-creating
 */
export function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * advanced-event-handler-refs: Store event handlers in refs
 * Avoids adding/removing event listeners on every render
 */
export function useEventCallback<Args extends unknown[], R>(
  fn: (...args: Args) => R
): (...args: Args) => R {
  const ref = useRef(fn);
  ref.current = fn;
  
  return useCallback((...args: Args) => {
    return ref.current(...args);
  }, []);
}

/**
 * advanced-init-once: Initialize once per app load
 * Runs the initialization function only once across all component instances
 */
let initOnceMap = new Map<string, boolean>();

export function useInitOnce(key: string, initFn: () => void | Promise<void>): void {
  const initializedRef = useRef(false);
  
  useEffect(() => {
    if (initializedRef.current) return;
    if (initOnceMap.get(key)) return;
    
    initializedRef.current = true;
    initOnceMap.set(key, true);
    
    const result = initFn();
    if (result instanceof Promise) {
      result.catch(() => {
        // If init fails, allow retry
        initOnceMap.delete(key);
        initializedRef.current = false;
      });
    }
  }, [key, initFn]);
}

/**
 * Hook for stable event handler refs with automatic cleanup
 * Use for window/document event listeners that should be deduplicated
 */
export function useGlobalEventListener<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  
  useEffect(() => {
    const handler = (event: WindowEventMap[K]) => listenerRef.current(event);
    window.addEventListener(type, handler, options);
    return () => window.removeEventListener(type, handler, options as boolean | EventListenerOptions);
  }, [type, options]);
}

/**
 * Hook for media query matching with SSR support
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);
    
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mediaQuery.addEventListener("change", handler);
    
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);
  
  return matches;
}

/**
 * Hook for debounced value
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  
  useEffect(() => {
    const timeoutId = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);
  
  return debounced;
}

/**
 * Hook for previous value
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/**
 * Hook for mounted state (useful for avoiding SSR hydration mismatches)
 */
export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  return mounted;
}

/**
 * Hook for reading/writing to a ref with a callback
 * Useful for advanced patterns where you need to read current value in callbacks
 */
export function useRefCallback<T>(
  callback: (ref: React.MutableRefObject<T>) => void
): React.MutableRefObject<T> {
  const ref = useRef<T>(null as any);
  
  useEffect(() => {
    callback(ref);
  }, [callback]);
  
  return ref;
}