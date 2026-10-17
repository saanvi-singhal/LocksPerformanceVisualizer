// Reveal.jsx
// A <section> that fades in the first time it scrolls into view.
// An IntersectionObserver tells us when the section becomes visible; we then
// add the class "is-visible" and CSS does the fade (see .reveal in
// styles.css). Under prefers-reduced-motion the CSS shows it at once.
import { useEffect, useRef, useState } from "react";

export function Reveal({ id, labelledBy, children }) {
  const ref = useRef(null);
  // If the browser has no IntersectionObserver, just show the section.
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (visible) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisible(true);
        observer.disconnect();  // only fade in once
      }
    }, { threshold: 0.05 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={labelledBy}
      className={visible ? "reveal is-visible" : "reveal"}
    >
      {children}
    </section>
  );
}
