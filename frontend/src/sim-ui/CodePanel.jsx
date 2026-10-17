// CodePanel.jsx
// The lock's pseudo-code, one numbered line per step. Every thread's chip
// sits on the line it will run next, and the line gets a bar in that
// thread's colour, so you can see where each thread is.
import { DONE } from "../sim/engine.js";
import { ThreadChip } from "./ThreadChip.jsx";

const SECTION_TITLES = {
  lock: "lock()",
  cs: "critical section",
  unlock: "unlock()",
};

export function CodePanel({ program, sim, threadColors }) {
  return (
    <div className="sim-panel">
      <h3>Pseudo-code</h3>
      <ol className="code-list">
        {program.map((line, index) => {
          const here = sim.threads.filter((t) => t.pc === index && t.status !== DONE);
          const startsSection = index === 0 || program[index - 1].section !== line.section;
          return (
            <li key={index} className={"code-line section-" + line.section}>
              {startsSection && <div className="code-section">{SECTION_TITLES[line.section]}</div>}
              <div className="code-row">
                {/* One coloured bar per thread on this line. */}
                <span className="code-bars" aria-hidden="true">
                  {here.map((t) => (
                    <span key={t.id} className="code-bar" style={{ background: threadColors[t.id] }} />
                  ))}
                </span>
                <span className="code-number">{index + 1}</span>
                <code className="code-text">{line.code}</code>
                <span className="code-chips">
                  {here.map((t) => <ThreadChip key={t.id} tid={t.id} color={threadColors[t.id]} />)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
