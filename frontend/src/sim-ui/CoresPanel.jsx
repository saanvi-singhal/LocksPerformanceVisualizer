// CoresPanel.jsx
// One lock in the cores and oversubscription mode:
//   - the live rate: acquisitions in the last 100 rounds, and the average;
//   - one slot per core, with the thread that ran on it in the last round;
//   - a lane of runnable threads that did not get a core ("waiting for a core");
//   - a lane of sleeping threads (semaphore, mutex), which never take a core;
//   - what each running thread did in the last round.
import {
  acquisitionsLast100, acquisitionsPer100, IDLE, IN_CS, SLEEPING, WAITING,
} from "../sim/engine.js";
import { LOCK_PROGRAMS } from "../sim/programs.js";
import { ThreadChip } from "./ThreadChip.jsx";

// A short word for what a thread is doing.
function doing(thread) {
  if (thread.status === IN_CS) return "in critical section";
  if (thread.status === WAITING) return "trying to get the lock";
  if (thread.status === SLEEPING) return "asleep";
  if (thread.status === IDLE) return "between acquisitions";
  return thread.status;
}

export function CoresPanel({ sim, cores, threadColors }) {
  const lock = LOCK_PROGRAMS[sim.lock];
  const running = sim.onCores;
  const waitingForCore = sim.threads.filter((t) => t.status !== SLEEPING && !running.includes(t.id));
  const sleeping = sim.threads.filter((t) => t.status === SLEEPING);
  // The log lines of the last round: one per thread that ran.
  const lastRound = sim.round === 0 ? [] : sim.log.slice(-running.length);

  const slots = [];
  for (let c = 0; c < cores; c++) {
    slots.push(running[c] === undefined ? null : sim.threads[running[c]]);
  }

  return (
    <div className="sim-panel cores-panel">
      <h3>{lock.title}</h3>

      <div className="rate-box">
        <div>
          <span className="rate-value">{acquisitionsLast100(sim)}</span>
          <span className="rate-label">
            acquisitions in the last {Math.min(100, sim.round)} round{sim.round === 1 ? "" : "s"}
          </span>
        </div>
        <div className="rate-sub">
          average {acquisitionsPer100(sim).toFixed(1)} per 100 rounds after {sim.round} rounds
          ({sim.completed} completed in total)
        </div>
      </div>

      <h4 className="cores-heading">Cores (ran in round {sim.round})</h4>
      <ol className="core-slots">
        {slots.map((thread, c) => (
          <li key={c} className={thread ? "core-slot" : "core-slot empty"}>
            <span className="core-name">core {c}</span>
            {thread ? (
              <>
                <ThreadChip tid={thread.id} color={threadColors[thread.id]} />
                <span className="core-doing">{doing(thread)}</span>
              </>
            ) : (
              <span className="core-doing">idle (no runnable thread)</span>
            )}
          </li>
        ))}
      </ol>

      <div className="lanes">
        <div className="lane">
          <div className="lane-title">waiting for a core (runnable)</div>
          <div className="lane-chips">
            {waitingForCore.map((t) => (
              <ThreadChip key={t.id} tid={t.id} color={threadColors[t.id]} note={t.status === IN_CS ? "holds lock" : undefined} />
            ))}
          </div>
        </div>
        {lock.sleeps && (
          <div className="lane">
            <div className="lane-title">sleeping (not runnable)</div>
            <div className="lane-chips">
              {sleeping.map((t) => <ThreadChip key={t.id} tid={t.id} color={threadColors[t.id]} />)}
            </div>
          </div>
        )}
      </div>

      {lastRound.length > 0 && (
        <>
          <h4 className="cores-heading">Last round</h4>
          <ul className="last-round">
            {lastRound.map((entry) => (
              <li key={entry.n}>
                <ThreadChip tid={entry.thread} color={threadColors[entry.thread]} /> {entry.explain}
              </li>
            ))}
          </ul>
        </>
      )}

      {sim.violations.length > 0 && (
        <p className="violation-inline" role="status">
          <span aria-hidden="true">✗ </span>
          Mutual exclusion violated {sim.violations.length} time{sim.violations.length === 1 ? "" : "s"}
          {" "}(this lock is broken on purpose).
        </p>
      )}
    </div>
  );
}
