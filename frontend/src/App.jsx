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
import { CompareLocks } from "./components/CompareLocks.jsx";
import { CountUp } from "./components/CountUp.jsx";

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

  // Locks switched off by clicking them in a legend. Shared by all charts,
  // so hiding a lock in one chart hides it in every chart.
  const [hiddenLocks, setHiddenLocks] = useState([]);
  function toggleLock(lock) {
    if (hiddenLocks.includes(lock)) {
      setHiddenLocks(hiddenLocks.filter((l) => l !== lock));
    } else {
      setHiddenLocks(hiddenLocks.concat([lock]));
    }
  }

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

  // Rows for the charts against thread count. row.undefinedFor lists the
  // locks that WERE run at this point but have no value (fairness not
  // defined), as opposed to locks that were not run there at all.
  function rowsByThreads(field, locks) {
    return threadCounts.map((t) => {
      const row = { x: threadLabel(t), undefinedFor: [] };
      for (const lock of locks) {
        row[lock] = value(lock, t, cs, field);
        const wasRun = index[lock + "/" + t + "/" + cs] !== undefined;
        if (wasRun && row[lock] == null) row.undefinedFor.push(lock);
      }
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
    (row) => row.cs === cs && (showBroken || !BROKEN_LOCKS.includes(row.lock)) && !hiddenLocks.includes(row.lock)
  );

  const tiles = summaryTiles(data, value, workingLocks, opThreads, cs, threadLabel);
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
              {tile.number && <div className="tile-number">{tile.number}</div>}
              <div className="tile-note">{tile.note}</div>
            </div>
          ))}
        </div>
        <p className="caption">
          Tiles follow the thread count and critical section chosen under Performance (now:{" "}
          {threadLabel(opThreads)} threads, {cs} critical section).
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
          <label className="slider">
            Threads: <strong>{threadLabel(opThreads)}</strong>
            {/* The slider moves through the measured thread counts (1, 2, 4, ...). */}
            <input
              type="range"
              min={0}
              max={threadCounts.length - 1}
              step={1}
              value={threadCounts.indexOf(opThreads)}
              onChange={(e) => setOpThreads(threadCounts[Number(e.target.value)])}
              aria-valuetext={threadLabel(opThreads) + " threads"}
            />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={showBroken} onChange={(e) => setShowBroken(e.target.checked)} />
            Show broken locks
          </label>
          {hiddenLocks.length > 0 && (
            <button type="button" className="link-button" onClick={() => setHiddenLocks([])}>
              Show all locks ({hiddenLocks.length} hidden)
            </button>
          )}
        </div>
        <p className="caption">
          The thread count and critical section chosen here also set the summary tiles at the top.
          Click a lock in any legend to hide or show it on every chart.
        </p>

        <CompareLocks
          locks={visibleLocks}
          value={value}
          threads={opThreads}
          cs={cs}
          threadLabel={threadLabel}
        />

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
            exactFormat={(v) => Math.round(v).toLocaleString("en-US") + " ops/s"}
            highlightX={threadLabel(opThreads)}
            hidden={hiddenLocks}
            onToggle={toggleLock}
          />
          <LockLineChart
            title={"Fairness vs threads (critical section: " + cs + ")"}
            caption={"Busiest thread's acquisitions ÷ least busy thread's, log scale. 1 = perfectly fair. " +
              "Broken locks are never shown here. A missing point is shown as \"n/a\" in the tooltip and table. " +
              oversubNote}
            missingText="n/a"
            footnote={"n/a: Some threads had not started when the first thread finished, so fairness is not " +
              "defined for this run. This is a start-up effect, not evidence of starvation."}
            rows={rowsByThreads("fairness_ratio", workingLocks)}
            locks={workingLocks}
            colors={colors}
            theme={theme}
            xLabel="threads"
            minY={1}
            format={(v) => v.toFixed(v >= 10 ? 0 : 2)}
            exactFormat={(v) => v.toFixed(4)}
            highlightX={threadLabel(opThreads)}
            hidden={hiddenLocks}
            onToggle={toggleLock}
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
            exactFormat={(v) => v.toFixed(5) + " µs"}
            hidden={hiddenLocks}
            onToggle={toggleLock}
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
      </section>

      <SweepFooter sweep={data.sweep} generated={data.generated} source={data.source} />
    </main>
  );
}

// Where the data came from: commit, sweep date, iterations per thread count.
function SweepFooter({ sweep, generated, source }) {
  const counts = Object.keys(sweep.iterations || {}).sort((a, b) => Number(a) - Number(b));
  return (
    <footer className="footer">
      <h2>About this data</h2>
      <dl className="footer-list">
        <div>
          <dt>Benchmark code</dt>
          <dd>dev commit <code>{sweep.commit || "unknown"}</code></dd>
        </div>
        <div>
          <dt>Sweep date</dt>
          <dd>{sweep.date || "unknown"}</dd>
        </div>
        <div>
          <dt>Runs per combination</dt>
          <dd>{sweep.runs || "unknown"} (median shown)</dd>
        </div>
        <div>
          <dt>Exported</dt>
          <dd>{generated} from <code>{source}</code></dd>
        </div>
      </dl>
      <div className="table-scroll">
        <table className="data-table footer-table">
          <thead>
            <tr>
              <th scope="col">threads</th>
              {counts.map((t) => <th scope="col" key={t}>{t}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">iterations per thread</th>
              {counts.map((t) => <td key={t}>{sweep.iterations[t].toLocaleString("en-US")}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </footer>
  );
}

// The four headline numbers at the top of the page, for the thread count
// and critical-section length chosen under Performance.
function summaryTiles(data, value, workingLocks, threads, cs, threadLabel) {
  const realLocks = workingLocks.filter((lock) => lock !== "atomic");

  // How many working locks were correct in every run.
  let allCorrect = 0;
  for (const lock of workingLocks) {
    const rows = data.correctness.filter((row) => row.lock === lock);
    if (rows.length > 0 && rows.every((row) => row.correct_runs === row.runs)) allCorrect++;
  }

  // Fastest and fairest real lock at the chosen thread count and cs length.
  // With 1 thread every lock is trivially fair, so "fairest" needs 2 or more.
  let fastest = null;
  let fairest = null;
  for (const lock of realLocks) {
    const ops = value(lock, threads, cs, "ops_per_sec");
    const fair = value(lock, threads, cs, "fairness_ratio");
    if (ops != null && (fastest === null || ops > fastest.ops)) fastest = { lock, ops };
    if (threads > 1 && fair != null && (fairest === null || fair < fairest.fair)) fairest = { lock, fair };
  }

  // Biggest loss when oversubscribed, for the chosen cs length.
  let worst = null;
  for (const row of data.oversubscription.rows) {
    if (row.cs !== cs || BROKEN_LOCKS.includes(row.lock)) continue;
    if (worst === null || row.retained_percent < worst.retained_percent) worst = row;
  }

  const where = threadLabel(threads) + " threads, " + cs + " critical section";

  // Each tile: label, main value, an optional number line, and a note.
  // Numbers use <CountUp>, which counts up to the value.
  return [
    {
      label: "Correct locks",
      value: <><CountUp value={allCorrect} format={(v) => String(Math.round(v))} /> of {workingLocks.length}</>,
      number: null,
      note: "correct in every run; none and peterson_relaxed fail as intended",
    },
    {
      label: "Fastest lock",
      value: fastest ? lockLabel(fastest.lock) : "–",
      number: fastest ? <><CountUp value={fastest.ops} format={shortNumber} /> ops/s</> : null,
      note: fastest ? "at " + where : "no data at " + where,
    },
    {
      label: "Fairest lock",
      value: fairest ? lockLabel(fairest.lock) : "–",
      number: fairest ? <>fairness ratio <CountUp value={fairest.fair} format={(v) => v.toFixed(3)} /></> : null,
      note: fairest ? "1 = perfectly fair, at " + where : "needs 2 or more threads",
    },
    {
      label: "Worst when oversubscribed",
      value: worst ? lockLabel(worst.lock) : "–",
      number: worst ? <><CountUp value={worst.retained_percent} format={(v) => v.toPrecision(2)} />% of throughput kept</> : null,
      note: worst ? "at " + data.oversubscription.oversub_threads + " threads, " + cs + " critical section" : "",
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
