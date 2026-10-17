// SimulatorView.jsx
// The "Simulator" view: an ILLUSTRATION of the lock algorithms, not measured
// data. It runs the step-by-step engine in src/sim/ and shows the
// pseudo-code, the shared variables, the threads, the counter and a log.
//
// State kept here (plain React state):
//   settings  lock, threads, iterations, scheduler mode, seed
//   sim       the simulation state from the engine (replaced on every step)
//   running   whether auto-run is on; speed = steps per second
//   script    in a replayed manual run: the thread to run at each step
import { useEffect, useRef, useState } from "react";

import { NavBar } from "../components/NavBar.jsx";
import {
  getProgram, isFinished, scheduleStep, step, MANUAL, RANDOM, ROUND_ROBIN, DONE, SLEEPING,
} from "../sim/engine.js";
import { LOCK_PROGRAMS } from "../sim/programs.js";
import { THREAD_COLORS } from "../theme.js";
import {
  fixThreads, newSim, replayHash, scriptFromParams, settingsFromParams,
} from "../sim-ui/settings.js";
import { CodePanel } from "../sim-ui/CodePanel.jsx";
import { StatePanel } from "../sim-ui/StatePanel.jsx";
import { ThreadLanes } from "../sim-ui/ThreadLanes.jsx";
import { EventLog } from "../sim-ui/EventLog.jsx";
import { ViolationBanner } from "../sim-ui/ViolationBanner.jsx";

export const SIM_NOTICE = "Illustration of the algorithm, not measured data";

const SIM_SECTIONS = [
  { id: "sim-controls", label: "Controls" },
  { id: "sim-run", label: "Run" },
  { id: "sim-log", label: "Event log" },
];

export function SimulatorView({ themeName, nav, params }) {
  const [settings, setSettings] = useState(() => settingsFromParams(params));
  const [sim, setSim] = useState(() => newSim(settingsFromParams(params)));
  const [script, setScript] = useState(() => scriptFromParams(params));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(4);
  // Number of violations already seen, so auto-run pauses at a NEW one.
  const seenViolations = useRef(0);

  // When the URL changes (a replay link, the back button), start again
  // from the settings in the URL.
  const paramsKey = JSON.stringify(params);
  useEffect(() => {
    const fromUrl = settingsFromParams(params);
    setSettings(fromUrl);
    setSim(newSim(fromUrl));
    setScript(scriptFromParams(params));
    setRunning(false);
  }, [paramsKey]);

  const threadColors = THREAD_COLORS[themeName];
  const program = getProgram(settings.lock);
  const lock = LOCK_PROGRAMS[settings.lock];
  const finished = isFinished(sim);

  // One step: follow the replay script, or let the scheduler choose.
  // Returns the same sim if nothing can run.
  function advance(current) {
    if (script) {
      const tid = script[current.stepCount];
      return tid === undefined ? current : step(current, tid);
    }
    if (settings.mode === MANUAL) return current;
    return scheduleStep(current, settings.mode);
  }

  const canAutoStep = !finished && (script ? sim.stepCount < script.length : settings.mode !== MANUAL);

  // Auto-run: one step every 1/speed seconds while running.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setSim((current) => advance(current)), 1000 / speed);
    return () => clearInterval(timer);
  }, [running, speed, settings, script]);

  // Pause auto-run at the end, or the moment a new violation happens.
  useEffect(() => {
    if (!running) return;
    if (!canAutoStep || sim.violations.length > seenViolations.current) {
      setRunning(false);
    }
  }, [sim, running]);

  // Changing a setting starts a new run with the new settings.
  function changeSettings(changes) {
    const next = { ...settings, ...changes };
    next.threads = fixThreads(next.lock, next.threads);
    setSettings(next);
    setSim(newSim(next));
    setScript(null);
    setRunning(false);
  }

  function startAutoRun() {
    seenViolations.current = sim.violations.length;
    setRunning(true);
  }

  function reset() {
    setSim(newSim(settings));
    setRunning(false);
  }

  // Manual mode: run one step of thread tid. Choosing by hand ends a replay.
  function runThread(tid) {
    setScript(null);
    setSim(step(sim, tid));
  }

  // Replay: go to the replay URL. If the URL is already the same (so no
  // hashchange event will fire), restart directly.
  function replay(event) {
    event.preventDefault();
    const hash = replayHash(settings, sim);
    if (window.location.hash === hash) {
      setSim(newSim(settings));
      setScript(scriptFromParams(Object.fromEntries(new URLSearchParams(hash.split("?")[1]))));
      setRunning(false);
    } else {
      window.location.hash = hash;
    }
  }

  const lastEntry = sim.log.length > 0 ? sim.log[sim.log.length - 1] : null;
  const latestViolation = sim.violations.length > 0 ? sim.violations[sim.violations.length - 1] : null;

  return (
    <>
      <NavBar {...nav} sections={SIM_SECTIONS} notice={SIM_NOTICE} />
      <main className="page sim-page">
        <header className="hero">
          <p className="eyebrow">Simulator · {SIM_NOTICE}</p>
          <h1>Step through a lock, one line at a time</h1>
          <p className="lede">
            Each thread runs lock(), then counter = counter + 1 split into read, add and write,
            then unlock(), {settings.iterations} time{settings.iterations === 1 ? "" : "s"}. You (or the
            scheduler) decide which thread runs the next line. Watch the shared variables, the
            threads and the counter, and see when mutual exclusion breaks.
          </p>
        </header>

        <section id="sim-controls" className="sim-controls" aria-label="Simulator controls">
          <div className="sim-control-row">
            <label>
              Lock
              <select value={settings.lock} onChange={(e) => changeSettings({ lock: e.target.value })}>
                {Object.values(LOCK_PROGRAMS).map((l) => (
                  <option key={l.name} value={l.name}>{l.title}{l.broken ? " (broken)" : ""}</option>
                ))}
              </select>
            </label>
            <label>
              Threads
              <select
                value={settings.threads}
                disabled={lock.minThreads === lock.maxThreads}
                onChange={(e) => changeSettings({ threads: Number(e.target.value) })}
              >
                {range(lock.minThreads, lock.maxThreads).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              Iterations per thread
              <select value={settings.iterations} onChange={(e) => changeSettings({ iterations: Number(e.target.value) })}>
                {range(1, 5).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              Scheduler
              <select value={settings.mode} onChange={(e) => changeSettings({ mode: e.target.value })}>
                <option value={MANUAL}>manual (you choose)</option>
                <option value={ROUND_ROBIN}>round robin</option>
                <option value={RANDOM}>random (seeded)</option>
              </select>
            </label>
            {settings.mode === RANDOM && (
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
          {lock.minThreads === lock.maxThreads && (
            <p className="caption">{lock.title} works for exactly {lock.minThreads} threads.</p>
          )}

          <div className="sim-control-row">
            <button type="button" className="sim-button" onClick={() => setSim(advance(sim))} disabled={!canAutoStep || running}>
              Step
            </button>
            {running ? (
              <button type="button" className="sim-button" onClick={() => setRunning(false)}>Pause</button>
            ) : (
              <button type="button" className="sim-button primary" onClick={startAutoRun} disabled={!canAutoStep}>
                Auto-run
              </button>
            )}
            <label className="speed">
              Speed: {speed} step{speed === 1 ? "" : "s"}/s
              <input type="range" min={1} max={20} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            </label>
            <button type="button" className="sim-button" onClick={reset}>Reset</button>
            <a className="sim-link" href={replayHash(settings, sim)} onClick={replay}>Replay this run</a>
          </div>

          {settings.mode === MANUAL && (
            <div className="sim-control-row" role="group" aria-label="Choose the next thread">
              {sim.threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="sim-button thread-button"
                  style={{ borderColor: threadColors[t.id] }}
                  disabled={t.status === DONE || t.status === SLEEPING}
                  onClick={() => runThread(t.id)}
                >
                  {t.status === SLEEPING ? "T" + t.id + " is asleep" : "Run T" + t.id + " next"}
                </button>
              ))}
              {script && <span className="caption">Replaying {script.length} recorded steps: use Step or Auto-run.</span>}
            </div>
          )}
          {settings.mode !== MANUAL && (
            <p className="caption">
              {settings.mode === RANDOM
                ? "The scheduler picks a random runnable thread for each step; the same seed always gives the same run."
                : "The scheduler gives each runnable thread one step in turn."}
            </p>
          )}
        </section>

        <aside className="sim-notice-box" aria-label="What to notice">
          <h3>What to notice: {lock.title}</h3>
          <p>{lock.notice}</p>
        </aside>

        {latestViolation && (
          <ViolationBanner violation={latestViolation} count={sim.violations.length} threadColors={threadColors} />
        )}

        <p className="sim-explain" aria-live="polite">
          {lastEntry
            ? "Step " + lastEntry.n + ": " + lastEntry.explain
            : "Press Step or Auto-run (or, in manual mode, choose a thread) to start."}
          {finished && " All threads are done."}
        </p>

        <section id="sim-run" className="sim-grid" aria-label="Simulation state">
          <CodePanel program={program} sim={sim} threadColors={threadColors} />
          <div className="sim-column">
            <ThreadLanes sim={sim} threadColors={threadColors} showSleeping={lock.sleeps === true} />
            <StatePanel sim={sim} threadColors={threadColors} />
          </div>
        </section>

        <section id="sim-log" aria-label="Event log">
          <EventLog log={sim.log} threadColors={threadColors} />
        </section>

        <p className="sim-notice-footer">{SIM_NOTICE}. One step is one line of pseudo-code; real threads run
          many instructions per microsecond, and the measured results are on the Results tab.</p>
      </main>
    </>
  );
}

// [low, low+1, ..., high]
function range(low, high) {
  const out = [];
  for (let i = low; i <= high; i++) out.push(i);
  return out;
}
