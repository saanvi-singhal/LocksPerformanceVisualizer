// NavBar.jsx
// The sticky bar at the top of the page:
//   - tabs for the views (Results, and later Simulator), as links to
//     "#/results" and "#/simulator";
//   - one button per section of the current view; clicking scrolls to it,
//     and the section currently on screen is highlighted ("scroll spy");
//   - a slot on the right for other controls (the theme toggle).
import { useEffect, useState } from "react";

import { useReducedMotion } from "../hooks.js";

// Props:
//   tabs      [{ id, label, href }]
//   activeTab id of the current view
//   sections  [{ id, label }]  ids of the <section> elements to link to
//   right     extra controls shown at the right end
export function NavBar({ tabs, activeTab, sections, right }) {
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(sections.length > 0 ? sections[0].id : null);

  // Scroll spy: a section counts as "current" while it crosses a band in
  // the upper middle of the screen (rootMargin cuts off the rest).
  useEffect(() => {
    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el) => el !== null);
    if (elements.length === 0 || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setCurrent(entry.target.id);
      }
    }, { rootMargin: "-30% 0px -60% 0px" });
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      setCurrent(id);
    }
  }

  return (
    <nav className="navbar" aria-label="Main">
      <div className="navbar-row">
        <span className="navbar-brand">Lock Bench</span>
        <ul className="navbar-tabs">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <a
                href={tab.href}
                className="navbar-tab"
                aria-current={tab.id === activeTab ? "page" : undefined}
              >
                {tab.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="navbar-right">{right}</div>
      </div>
      {sections.length > 0 && (
        <ul className="navbar-sections" aria-label="Sections">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="navbar-section"
                aria-current={s.id === current ? "true" : undefined}
                onClick={() => scrollToSection(s.id)}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
