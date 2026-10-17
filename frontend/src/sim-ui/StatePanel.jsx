// StatePanel.jsx
// The live values of the shared variables, each thread's private variables,
// and the counter. The variable written by the latest step is highlighted
// (a short colour flash, or a plain highlight with reduced motion).
import { expectedCounter, isFinished } from "../sim/engine.js";
import { ThreadChip } from "./ThreadChip.jsx";

// true/false/numbers/undefined as text.
function show(value) {
  if (value === undefined || value === null) return "–";
  return String(value);
}

export function StatePanel({ sim, threadColors }) {
  const last = sim.log.length > 0 ? sim.log[sim.log.length - 1] : null;
  const changed = last ? last.changed : [];
  const names = Object.keys(sim.shared).filter((name) => name !== "counter");

  // Every private variable name any thread has (tmp, my_ticket, ...).
  const localNames = [];
  for (const t of sim.threads) {
    for (const name of Object.keys(t.local)) {
      if (!localNames.includes(name)) localNames.push(name);
    }
  }

  const expected = expectedCounter(sim);
  const finished = isFinished(sim);
  const lost = expected - sim.shared.counter;

  return (
    <div className="sim-panel">
      <h3>Shared variables</h3>
      {names.length === 0 && <p className="caption">This lock has no shared variables.</p>}
      <dl className="var-list">
        {names.map((name) => {
          const value = sim.shared[name];
          return (
            <div key={name} className="var-row">
              <dt><code>{name}</code></dt>
              <dd>
                {Array.isArray(value) ? (
                  <span className="var-array">
                    {value.map((v, i) => {
                      const isChanged = changed.includes(name + "[" + i + "]");
                      return (
                        <span
                          key={i + "-" + (isChanged ? sim.stepCount : 0)}
                          className={isChanged ? "var-cell changed" : "var-cell"}
                          title={name + "[" + i + "]"}
                        >
                          <span className="var-index">[{i}]</span> {show(v)}
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  <span
                    key={changed.includes(name) ? sim.stepCount : 0}
                    className={changed.includes(name) ? "var-cell changed" : "var-cell"}
                  >
                    {show(value)}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="counter-box">
        <span className="counter-label">counter</span>
        <span
          key={changed.includes("counter") ? sim.stepCount : 0}
          className={changed.includes("counter") ? "counter-value changed" : "counter-value"}
        >
          {sim.shared.counter}
        </span>
        <span className="counter-note">
          {finished
            ? (lost === 0
              ? "finished: correct (" + expected + " expected)"
              : "finished: " + lost + " update" + (lost === 1 ? "" : "s") + " lost (" + expected + " expected)")
            : "should reach " + expected + " (" + sim.threadCount + " threads × " + sim.iterations + " iterations)"}
        </span>
      </div>

      {localNames.length > 0 && (
        <>
          <h3>Private variables</h3>
          <div className="table-scroll">
            <table className="data-table sim-locals">
              <thead>
                <tr>
                  <th scope="col">thread</th>
                  {localNames.map((n) => <th scope="col" key={n}><code>{n}</code></th>)}
                </tr>
              </thead>
              <tbody>
                {sim.threads.map((t) => (
                  <tr key={t.id}>
                    <th scope="row"><ThreadChip tid={t.id} color={threadColors[t.id]} /></th>
                    {localNames.map((n) => <td key={n}>{show(t.local[n])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
