// hooks.js
// Small React hooks shared by the whole page.
import { useEffect, useState } from "react";

// Reads the URL hash as a simple route, without a router library:
//   "#/results"                         -> { view: "results", params: {} }
//   "#/simulator?lock=tas&threads=3"    -> { view: "simulator",
//                                            params: { lock: "tas", threads: "3" } }
// Anything else counts as "results".
export function parseHash(hash) {
  const text = hash.replace(/^#/, "");
  const parts = text.split("?");
  const path = parts[0];
  const params = {};
  new URLSearchParams(parts[1] || "").forEach((value, key) => {
    params[key] = value;
  });
  return { view: path === "/simulator" ? "simulator" : "results", params: params };
}

// The current route, updated whenever the hash changes (links, back button).
export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

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
