// hooks.js
// Small React hooks shared by the whole page.
import { useEffect, useState } from "react";

const THEME_KEY = "theme";

// The light/dark theme. Starts from the viewer's saved choice, or from the
// operating system setting on a first visit. Returns [theme, setTheme].
// The choice is written to <html data-theme="..."> (styles.css reads it)
// and remembered in localStorage. Storage can be blocked (private mode,
// some browsers), so every access is inside try/catch and the page still
// works, it just does not remember.
export function useThemeChoice() {
  const [theme, setTheme] = useState(() => {
    let saved = null;
    try {
      saved = window.localStorage.getItem(THEME_KEY);
    } catch (e) {
      saved = null;
    }
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // Ignore: the choice just will not be remembered.
    }
  }, [theme]);

  return [theme, setTheme];
}

// true when the viewer asked the operating system for less motion
// (prefers-reduced-motion). All animations check this and are skipped.
export function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (e) => setReduced(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
