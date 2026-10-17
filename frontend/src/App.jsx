// App.jsx
// The top of the page. It keeps the light/dark theme, reads the route from
// the URL hash (#/results or #/simulator) and shows that view. Both views
// draw the same sticky navigation bar, with these tabs.
import { ResultsView } from "./views/ResultsView.jsx";
import { SimulatorView } from "./views/SimulatorView.jsx";
import { CoresView } from "./views/CoresView.jsx";
import { ThemeToggle } from "./components/ThemeToggle.jsx";
import { useHashRoute, useThemeChoice } from "./hooks.js";

const TABS = [
  { id: "results", label: "Results", href: "#/results" },
  { id: "simulator", label: "Simulator", href: "#/simulator" },
];

export default function App() {
  const [themeName, setThemeName] = useThemeChoice();
  const route = useHashRoute();

  // What every view passes to its NavBar.
  const nav = {
    tabs: TABS,
    activeTab: route.view,
    right: <ThemeToggle theme={themeName} onChange={setThemeName} />,
  };

  if (route.view === "simulator" && route.params.view === "cores") {
    return <CoresView themeName={themeName} nav={nav} params={route.params} />;
  }
  if (route.view === "simulator") {
    return <SimulatorView themeName={themeName} nav={nav} params={route.params} />;
  }
  return <ResultsView themeName={themeName} nav={nav} params={route.params} />;
}
