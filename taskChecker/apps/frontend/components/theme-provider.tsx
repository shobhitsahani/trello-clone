"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "tf.theme.v1";

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  isDark: false,
  setTheme: () => {},
  toggle: () => {},
});

function getStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // storage unavailable — fall through to system preference
  }
  return null;
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", t === "dark");
  root.style.colorScheme = t;
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // private mode etc. — theme still applies for the session
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start light to match SSR; correct on mount (layout inline script
  // already set the class pre-paint, this just syncs React state).
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(getStoredTheme() ?? getSystemTheme());
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme ]);

  // Follow OS changes only when the user hasn't picked explicitly.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => {
      if (getStoredTheme() == null) {
        setThemeState(e.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  const value = useMemo(
    () => ({ theme, isDark: theme === "dark", setTheme, toggle }),
    [theme, setTheme, toggle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
