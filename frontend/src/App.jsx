// App.jsx
// The whole dashboard page. It loads public/data/results.json (written by
// scripts/export_results.py) and shows:
//   summary, the locks, correctness, throughput, fairness,
//   time per operation, oversubscription, and the machine details.
import { useEffect, useState } from "react";

import { BROKEN_LOCKS, LOCK_COLORS, LOCK_INFO, LOCK_MARKERS, LOCK_ORDER, lockLabel } from "./locks.js";
import { shortNumber } from "./format.js";
import { LockLineChart } from "./components/LockLineChart.jsx";
import { CorrectnessTable } from "./components/CorrectnessTable.jsx";
import { OversubChart } from "./components/OversubChart.jsx";
import { LegendSwatch } from "./components/Marker.jsx";

// Chart colours that are not lock colours (axes, grid, surface, text).
const THEME_COLORS = {
  light: { surface: "#fcfcfb", text: "#0b0b0b", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7" },
  dark:  { surface: "#1a1a19", text: "#f0efec", muted: "#898781", grid: "#2c2c2a", axis: "#383835" },
};

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Filters shared by the charts below them.
  const [cs, setCs] = useState("empty");
  const [opThreads, setOpThreads] = useState(16);
  const [showBroken, setShowBroken] = useState(false);

  const themeName = useTheme();
  const theme = THEME_COLORS[themeName];
  const colors = {};
  for (const lock of LOCK_ORDER) {
    colors[lock] = LOCK_COLORS[lock][themeName];
  }

  // Load the results once.
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "data/results.json")
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then((json) => {
        setData(json);
        setOpThreads(json.oversubscription.base_threads);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <main className="page">
        <p className="error">
          Could not load data/results.json ({error}). Run{" "}
          <code>python3 scripts/export_results.py</code> first.
        </p>
      </main>
    );
  }
  if (!data) {
    return <main className="page"><p className="caption">Loading results…</p></main>;
  }

  const threadCounts = data.thread_counts;
  const oversubThreads = data.oversubscription.oversub_threads;
  const baseThreads = data.oversubscription.base_threads;

  // Look up one median value: value(lock, threads, cs, "ops_per_sec").
  const index = {};
  for (const row of data.medians) {
    index[row.lock + "/" + row.threads + "/" + row.cs] = row;
  }
  function value(lock, threads, csName, field) {
    const row = index[lock + "/" + threads + "/" + csName];
    return row ? row[field] : null;
  }

  // Locks to draw in the line charts.
  const visibleLocks = LOCK_ORDER.filter((lock) => showBroken || !BROKEN_LOCKS.includes(lock));
  const workingLocks = LOCK_ORDER.filter((lock) => !BROKEN_LOCKS.includes(lock));

  // The largest thread count is the oversubscribed one; mark it with "*".
  function threadLabel(t) {
    return t === oversubThreads ? t + "*" : String(t);
  }

  // Rows for the charts against thread count.
  function rowsByThreads(field, locks) {
    return threadCounts.map((t) => {
      const row = { x: threadLabel(t) };
      for (const lock of locks) row[lock] = value(lock, t, cs, field);
      return row;
    });
  }
  // Rows for the chart against critical-section length.
  const timeRows = data.cs_lengths.map((csName) => {
    const row = { x: csName };
    for (const lock of visibleLocks) row[lock] = value(lock, opThreads, csName, "us_per_op");
    return row;
  });

  const oversubRows = data.oversubscription.rows.filter(
    (row) => row.cs === cs && (showBroken || !BROKEN_LOCKS.includes(row.lock))
  );

  const tiles = summaryTiles(data, value, workingLocks, baseThreads);
  const oversubNote = threadLabel(oversubThreads) + " = 2 × CPUs (oversubscribed), run with fewer iterations per thread.";

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">VIT BCSE303L Operating Systems · Module 4 · Concurrency</p>
        <h1>Lock Bench: how mutual-exclusion locks behave under contention</h1>
        <p className="lede">
          Every thread repeatedly takes a lock, increments one shared counter, does a little
          work and releases the lock. We measure whether the count is right (correctness), how many
          lock acquisitions per second all threads achieve together (throughput) and whether every
          thread gets a fair share (fairness), from 1 to {oversubThreads} threads.
        </p>
        <ThemeToggle />
      </header>

      <section aria-labelledby="summary">
        <h2 id="summary">Summary</h2>
        <div className="tiles">
          {tiles.map((tile) => (
            <div className="tile" key={tile.label}>
              <div className="tile-label">{tile.label}</div>
              <div className="tile-value">{tile.value}</div>
              <div className="tile-note">{tile.note}</div>
            </div>
          ))}
        </div>
        <p className="caption">
          Medians over 5 runs per combination. Runs stop as soon as the first thread finishes its
          iterations (the "fairness window"), so locks are compared by rate (ops/s), not by total time.
        </p>
      </section>

      <section aria-labelledby="locks">
        <h2 id="locks">The locks</h2>
        <div className="lock-grid">
          {LOCK_INFO.map((info) => (
            <article className="lock-card" key={info.lock}>
              <div className="lock-card-head">
                <LegendSwatch
                  shape={LOCK_MARKERS[info.lock]}
                  color={colors[info.lock]}
                  surface={theme.surface}
                  dashed={BROKEN_LOCKS.includes(info.lock)}
                />
                <span className="lock-kind">{info.kind}</span>
              </div>
              <h3>{info.title}</h3>
              <p>{info.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="correctness">
        <h2 id="correctness">Correctness</h2>
        <p className="caption">
          Runs where the shared counter equals the number of lock acquisitions (no lost updates),
          over all three critical-section lengths. "–" means the lock does not support that thread
          count (Peterson needs exactly 2). With 1 thread even "none" is correct: there is nobody to race with.
        </p>
        <CorrectnessTable correctness={data.correctness} threadCounts={threadCounts} />
      </section>

      <section aria-labelledby="performance">
        <h2 id="performance">Performance</h2>

        <div className="filters" role="group" aria-label="Chart filters">
          <label>
            Critical section
            <select value={cs} onChange={(e) => setCs(e.target.value)}>
              {data.cs_lengths.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Threads (time per operation)
            <select value={opThreads} onChange={(e) => setOpThreads(Number(e.target.value))}>
              {threadCounts.map((t) => <option key={t} value={t}>{threadLabel(t)}</option>)}
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={showBroken} onChange={(e) => setShowBroken(e.target.checked)} />
            Show broken locks
          </label>
        </div>

        <div className="chart-grid">
          <LockLineChart
            title={"Throughput vs threads (critical section: " + cs + ")"}
            caption={"All threads together, operations per second, log scale. Higher is better. " + oversubNote}
            rows={rowsByThreads("ops_per_sec", visibleLocks)}
            locks={visibleLocks}
            colors={colors}
            theme={theme}
            xLabel="threads"
            format={(v) => shortNumber(v) + " ops/s"}
          />
          <LockLineChart
            title={"Fairness vs threads (critical section: " + cs + ")"}
            caption={"Busiest thread's acquisitions ÷ least busy thread's, log scale. 1 = perfectly fair. " +
              "Broken locks are never shown here. A missing point (\"starved\" in the table) means that in " +
              "every run some thread got no acquisitions at all, so the ratio is infinite. At " +
              threadLabel(oversubThreads) + " this is partly a start-up effect: with only 1000 iterations a fast " +
              "lock can finish before every thread has started. " + oversubNote}
            missingText="starved"
            rows={rowsByThreads("fairness_ratio", workingLocks)}
            locks={workingLocks}
            colors={colors}
            theme={theme}
            xLabel="threads"
            minY={1}
            format={(v) => v.toFixed(v >= 10 ? 0 : 2)}
          />
          <LockLineChart
            title={"Time per operation vs critical-section length (" + threadLabel(opThreads) + " threads)"}
            caption="Average wall time per lock acquisition in microseconds (1 ÷ throughput), log scale. Lower is better."
            rows={timeRows}
            locks={visibleLocks}
            colors={colors}
            theme={theme}
            xLabel="critical section"
            format={(v) => shortNumber(v) + " µs"}
          />
        </div>
      </section>

      <section aria-labelledby="oversub">
        <h2 id="oversub">Oversubscription</h2>
        <p className="caption">
          With more threads than CPUs, a lock that hands over to one specific next thread (ticket, bakery)
          has to wait whenever that thread is not running, so throughput collapses. Locks whose waiters
          sleep (mutex, semaphore) or where any running thread can take the lock (TAS, TTAS) degrade far less.
        </p>
        <OversubChart
          rows={oversubRows}
          colors={colors}
          theme={theme}
          baseThreads={baseThreads}
          oversubThreads={oversubThreads}
          cs={cs}
        />
      </section>

      <section aria-labelledby="machine">
        <h2 id="machine">Machine</h2>
        <dl className="machine">
          {Object.entries(data.machine.fields).map(([key, val]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{val}</dd>
            </div>
          ))}
        </dl>
        <p className="caption">Data exported {data.generated} from {data.source}.</p>
      </section>
    </main>
  );
}

// The four headline numbers at the top of the page.
function summaryTiles(data, value, workingLocks, baseThreads) {
  const realLocks = workingLocks.filter((lock) => lock !== "atomic");

  // How many working locks were correct in every run.
  let allCorrect = 0;
  for (const lock of workingLocks) {
    const rows = data.correctness.filter((row) => row.lock === lock);
    if (rows.length > 0 && rows.every((row) => row.correct_runs === row.runs)) allCorrect++;
  }

  // Fastest and fairest real lock at one thread per CPU, empty critical section.
  let fastest = null;
  let fairest = null;
  for (const lock of realLocks) {
    const ops = value(lock, baseThreads, "empty", "ops_per_sec");
    const fair = value(lock, baseThreads, "empty", "fairness_ratio");
    if (ops != null && (fastest === null || ops > fastest.ops)) fastest = { lock, ops };
    if (fair != null && (fairest === null || fair < fairest.fair)) fairest = { lock, fair };
  }

  // Biggest loss when oversubscribed (empty critical section).
  let worst = null;
  for (const row of data.oversubscription.rows) {
    if (row.cs !== "empty" || BROKEN_LOCKS.includes(row.lock)) continue;
    if (worst === null || row.retained_percent < worst.retained_percent) worst = row;
  }

  return [
    {
      label: "Correct locks",
      value: allCorrect + " of " + workingLocks.length,
      note: "correct in every run; none and peterson_relaxed fail as intended",
    },
    {
      label: "Fastest lock at " + baseThreads + " threads",
      value: fastest ? lockLabel(fastest.lock) : "–",
      note: fastest ? shortNumber(fastest.ops) + " ops/s, empty critical section" : "",
    },
    {
      label: "Fairest lock at " + baseThreads + " threads",
      value: fairest ? lockLabel(fairest.lock) : "–",
      note: fairest ? "fairness ratio " + fairest.fair.toFixed(3) + " (1 = perfectly fair)" : "",
    },
    {
      label: "Worst when oversubscribed",
      value: worst ? lockLabel(worst.lock) : "–",
      note: worst ? "keeps " + worst.retained_percent.toPrecision(2) + "% of its throughput at " +
        data.oversubscription.oversub_threads + " threads" : "",
    },
  ];
}

// Follows the operating system's light/dark setting, unless the viewer
// picked one with the toggle (stored as data-theme on <html>).
function useTheme() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const [systemDark, setSystemDark] = useState(media.matches);
  const [forced, setForced] = useState(document.documentElement.dataset.theme || null);

  useEffect(() => {
    const onMedia = (e) => setSystemDark(e.matches);
    media.addEventListener("change", onMedia);
    // The toggle changes data-theme; watch for that too.
    const observer = new MutationObserver(() => {
      setForced(document.documentElement.dataset.theme || null);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", onMedia);
      observer.disconnect();
    };
  }, []);

  if (forced === "light" || forced === "dark") return forced;
  return systemDark ? "dark" : "light";
}

// Button that cycles: system -> light -> dark -> system.
function ThemeToggle() {
  const [mode, setMode] = useState(() => {
    let saved = null;
    try {
      saved = window.localStorage.getItem("theme");
    } catch (e) {
      saved = null;  // storage can be blocked; just follow the system
    }
    return saved === "light" || saved === "dark" ? saved : "system";
  });

  useEffect(() => {
    if (mode === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
    }
    try {
      window.localStorage.setItem("theme", mode);
    } catch (e) {
      // Ignore: the choice just will not be remembered.
    }
  }, [mode]);

  const next = { system: "light", light: "dark", dark: "system" };
  return (
    <button className="theme-toggle" onClick={() => setMode(next[mode])}>
      Theme: {mode}
    </button>
  );
}
