import { useCallback, useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";

const KEY = "eh-theme";

function read(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* ignore blocked storage */
  }
  return "system";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => read());

  useEffect(() => apply(theme), [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* ignore blocked storage */
    }
  }, []);

  return { theme, setTheme };
}

export type ReaderPrefs = { size: number; spacing: number };

const READER_KEY = "eh-reader";
const SIZES = ["0.9375rem", "1.0625rem", "1.1875rem"];
const SPACING = ["1.55", "1.65", "1.8"];

function readPrefs(): ReaderPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(READER_KEY) ?? "") as Partial<ReaderPrefs>;
    return {
      size: clamp(parsed.size, SIZES.length),
      spacing: clamp(parsed.spacing, SPACING.length),
    };
  } catch {
    return { size: 1, spacing: 1 };
  }
}

function clamp(value: unknown, length: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length
    ? value
    : Math.min(1, length - 1);
}

export function useReaderPrefs() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(readPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(READER_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore blocked storage */
    }
  }, [prefs]);

  return {
    prefs,
    setPrefs,
    size: SIZES[prefs.size] ?? SIZES[1],
    lineHeight: SPACING[prefs.spacing] ?? SPACING[1],
  };
}
