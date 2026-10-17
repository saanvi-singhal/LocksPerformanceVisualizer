// CoresView.jsx
// The "Cores and oversubscription" part of the Simulator: an ILLUSTRATION
// with a simplified scheduler model, not measured data.
//
// Every round, at most "cores" runnable threads take one step each; which
// ones run rotates (round robin) or is picked at random with a seed.
// Sleeping threads never take a core. Threads loop for ever, and we count
// completed lock acquisitions per 100 rounds. Two locks can run side by
// side in lockstep (same rounds, same seed) to compare them.
//
// State (plain React state):
//   settings  lock, compare (second lock or ""), threads, cores, sched, seed
//   sims      { a, b }: the simulation of each lock (b is null if no comparison)
//   running   auto-run on/off; speed = rounds per second
import { useEffect, useState } from "react";

import { NavBar } from "../components/NavBar.jsx";
import { createSim, runRound, RANDOM, ROUND_ROBIN } from "../sim/engine.js";
import { LOCK_PROGRAMS } from "../sim/programs.js";
import { THREAD_COLORS } from "../theme.js";
import { CoresPanel } from "../sim-ui/CoresPanel.jsx";
import { SimModeTabs } from "../sim-ui/SimModeTabs.jsx";
import { StatePanel } from "../sim-ui/StatePanel.jsx";

export const CORES_NOTICE = "Illustration: this is a simplified scheduler model, not measured data. " +
  "The real measurements are on the Results tab";

// Locks that can run with up to 8 threads (not the 2-thread Peterson locks).
const CORE_LOCKS = Object.values(LOCK_PROGRAMS).filter((l) => l.maxThreads >= 8);

const PRESET = { lock: "ticket", compare: "semaphore", threads: 8, cores: 4, sched: RANDOM, seed: 1 };

// How many log lines each simulation keeps (only the last round is shown).
const LOG_LIMIT = 50;

function clampInt(text, low, high, fallback) {
  const n = parseInt(text, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(high, Math.max(low, n));
}

// Settings from the URL hash (#/simulator?view=cores&lock=...&compare=...).
function settingsFromParams(params) {
  const known = (name) => CORE_LOCKS.some((l) => l.name === name);
  // A first visit (no lock in the URL) shows the preset comparison;
  // otherwise compare only with a lock named in the URL.
  let compare;
  if (params.lock === undefined) {
    compare = PRESET.compare;
  } else {
    compare = known(params.compare) ? params.compare : "";
  }
  return {
    lock: known(params.lock) ? params.lock : PRESET.lock,
    compare: compare,
    threads: clampInt(params.threads, 2, 8, PRESET.threads),
    cores: clampInt(params.cores, 1, 4, PRESET.cores),
    sched: params.sched === "rr" ? ROUND_ROBIN : RANDOM,
    seed: clampInt(params.seed, 0, 999999, PRESET.seed),
  };
}

function settingsHash(s) {
  const params = new URLSearchParams();
  params.set("view", "cores");
  params.set("lock", s.lock);
  params.set("compare", s.compare);
  params.set("threads", String(s.threads));
  params.set("cores", String(s.cores));
  params.set("sched", s.sched === ROUND_ROBIN ? "rr" : "random");
  params.set("seed", String(s.seed));
  return "#/simulator?" + params.toString();
}

function newCoreSim(lockName, s) {
  return createSim({ lock: lockName, threads: s.threads, iterations: Infinity, seed: s.seed, logLimit: LOG_LIMIT });
}

function newSims(s) {
  return { a: newCoreSim(s.lock, s), b: s.compare ? newCoreSim(s.compare, s) : null };
}

export function CoresView({ themeName, nav, params }) {
  const [settings, setSettings] = useState(() => settingsFromParams(params));
  const [sims, setSims] = useState(() => newSims(settingsFromParams(params)));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(5);

  // Start again when the URL changes (replay link, back button).
  const paramsKey = JSON.stringify(params);
  useEffect(() => {
    const fromUrl = settingsFromParams(params);
    setSettings(fromUrl);
    setSims(newSims(fromUrl));
    setRunning(false);
  }, [paramsKey]);

  // Auto-run: one round of every simulation, every 1/speed seconds.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setSims((current) => nextRound(current, settings)), 1000 / speed);
    return () => clearInterval(timer);
  }, [running, speed, settings]);

  const threadColors = THREAD_COLORS[themeName];

  function changeSettings(changes) {
    const next = { ...settings, ...changes };
    setSettings(next);
    setSims(newSims(next));
    setRunning(false);
  }

  function loadPreset() {
    setSettings(PRESET);
    setSims(newSims(PRESET));
    setRunning(false);
  }

  return (
    <>
      <NavBar {...nav} sections={[]} notice={CORES_NOTICE} />
      <main className="page sim-page">
        <header className="hero">
          <p className="eyebrow">Simulator · {CORES_NOTICE}.</p>
          <SimModeTabs active="cores" />
          <h1>Cores and oversubscription</h1>
          <p className="lede">
            Every round, at most {settings.cores} of the {settings.threads} threads get a core and take
            one step each; which ones run rotates. Threads loop for ever, and the panel counts how many
            lock acquisitions complete per 100 rounds. Sleeping threads (semaphore, mutex) never take a
            core; spinning threads do.
          </p>
        </header>

        <section className="sim-controls" aria-label="Cores controls">
          <div className="sim-control-row">
            <label>
              Lock
              <select value={settings.lock} onChange={(e) => changeSettings({ lock: e.target.value })}>
                {CORE_LOCKS.map((l) => <option key={l.name} value={l.name}>{l.title}{l.broken ? " (broken)" : ""}</option>)}
              </select>
            </label>
            <label>
              Compare with
              <select value={settings.compare} onChange={(e) => changeSettings({ compare: e.target.value })}>
                <option value="">(nothing)</option>
                {CORE_LOCKS.map((l) => <option key={l.name} value={l.name}>{l.title}{l.broken ? " (broken)" : ""}</option>)}
              </select>
            </label>
            <label>
              Threads
              <select value={settings.threads} onChange={(e) => changeSettings({ threads: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              Cores
              <select value={settings.cores} onChange={(e) => changeSettings({ cores: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              Scheduler
              <select value={settings.sched} onChange={(e) => changeSettings({ sched: e.target.value })}>
                <option value={ROUND_ROBIN}>round robin (fair rotation)</option>
                <option value={RANDOM}>random (seeded)</option>
              </select>
            </label>
            {settings.sched === RANDOM && (
              <label>
                Seed
                <input
                  type="number"
                  min={0}
                  max={999999}
                  value={settings.seed}
                  onChange={(e) => changeSettings({ seed: Number(e.target.value) || 0 })}
                />
              </label>
            )}
          </div>

          <div className="sim-control-row">
            <button type="button" className="sim-button" disabled={running}
              onClick={() => setSims((current) => nextRound(current, settings))}>
              Run one round
            </button>
            {running ? (
              <button type="button" className="sim-button" onClick={() => setRunning(false)}>Pause</button>
            ) : (
              <button type="button" className="sim-button primary" onClick={() => setRunning(true)}>Auto-run</button>
            )}
            <label className="speed">
              Speed: {speed} round{speed === 1 ? "" : "s"}/s
              <input type="range" min={1} max={30} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            </label>
            <button type="button" className="sim-button" onClick={() => changeSettings({})}>Reset</button>
            <button type="button" className="sim-button" onClick={loadPreset}>
              Preset: ticket vs semaphore, 8 threads on 4 cores
            </button>
            <a className="sim-link" href={settingsHash(settings)}>Link to these settings</a>
          </div>
          <p className="caption">
            The iterations selector of the step-by-step view does not apply here: threads loop for ever.
          </p>
        </section>

        <aside className="sim-notice-box" aria-label="About this model">
          <h3>About this model</h3>
          <p>
            One round is not a fixed amount of real time, and these counts must not be compared with the
            benchmark numbers on the Results tab. The scheduler knows nothing about the locks: it only sees
            which threads are runnable. A spinning thread that gets a core uses it to check the lock again;
            a sleeping thread leaves the core to someone else.
          </p>
          <p className="model-note">
            <strong>Limitation:</strong> cores rotate every round, so a thread is never kept off a core for
            long. Real schedulers keep a thread off a core for a whole time slice, so when the thread that is
            next in line (for example the next ticket) is not running, everyone behind it waits much longer.
            That is why the measured collapse of the ticket and bakery locks is far larger than this model
            shows; here TAS slows down about as much as the ticket lock. The model shows the direction of
            the effect, not its size.
          </p>
        </aside>

        <section className={sims.b ? "cores-grid two" : "cores-grid"} aria-label="Cores simulation">
          <CoresPanel sim={sims.a} cores={settings.cores} threadColors={threadColors} />
          {sims.b && <CoresPanel sim={sims.b} cores={settings.cores} threadColors={threadColors} />}
        </section>

        {!sims.b && (
          <section className="cores-state" aria-label="Shared variables">
            <StatePanel sim={sims.a} threadColors={threadColors} />
          </section>
        )}

        <p className="sim-notice-footer">{CORES_NOTICE}.</p>
      </main>
    </>
  );
}

// One round of every simulation, in lockstep.
function nextRound(sims, settings) {
  return {
    a: runRound(sims.a, settings.cores, settings.sched),
    b: sims.b ? runRound(sims.b, settings.cores, settings.sched) : null,
  };
}
