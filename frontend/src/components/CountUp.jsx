// CountUp.jsx
// Shows a number that counts up from its previous value (0 at first) to
// the new value over a short time. With prefers-reduced-motion it simply
// shows the final number.
import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "../hooks.js";

const DURATION_MS = 700;

// Props: value (a number), format (function number -> text).
export function CountUp({ value, format }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const fromRef = useRef(0);  // the number shown when the animation starts

  useEffect(() => {
    if (reduced) {
      setShown(value);
      fromRef.current = value;
      return undefined;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;

    function tick(now) {
      const t = Math.min(1, (now - start) / DURATION_MS);
      // Ease out: fast at first, slowing down near the end.
      const eased = 1 - (1 - t) * (1 - t);
      const current = from + (value - from) * eased;
      setShown(current);
      fromRef.current = current;
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return <span className="count-up">{format(shown)}</span>;
}
