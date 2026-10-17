// hooks.js
// Small React hooks shared by the whole page.
import { useEffect, useState } from "react";

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
