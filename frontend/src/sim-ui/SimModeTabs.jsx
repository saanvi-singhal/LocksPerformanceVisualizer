// SimModeTabs.jsx
// The two parts of the Simulator: "Step by step" (#/simulator) and
// "Cores and oversubscription" (#/simulator?view=cores).
export function SimModeTabs({ active }) {
  return (
    <nav className="sim-mode-tabs" aria-label="Simulator mode">
      <a href="#/simulator" aria-current={active === "step" ? "page" : undefined}>Step by step</a>
      <a href="#/simulator?view=cores" aria-current={active === "cores" ? "page" : undefined}>
        Cores and oversubscription
      </a>
    </nav>
  );
}
