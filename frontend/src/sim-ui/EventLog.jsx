// EventLog.jsx
// One line per step, newest first: step number, thread, pseudo-code line
// and a plain-English explanation.
import { ThreadChip } from "./ThreadChip.jsx";

// How many lines to show (the full log is kept in the simulation state).
const SHOW_LINES = 60;

export function EventLog({ log, threadColors }) {
  const lines = log.slice(-SHOW_LINES).reverse();
  return (
    <div className="sim-panel">
      <h3>Event log</h3>
      {lines.length === 0 && <p className="caption">Nothing has happened yet.</p>}
      <ol className="event-log" reversed>
        {lines.map((entry) => <LogLine key={entry.n} entry={entry} threadColors={threadColors} />)}
      </ol>
      {log.length > SHOW_LINES && (
        <p className="caption">Showing the latest {SHOW_LINES} of {log.length} steps.</p>
      )}
    </div>
  );
}

// One log line. Also used by the violation banner.
export function LogLine({ entry, threadColors }) {
  return (
    <li className="log-line" value={entry.n}>
      <span className="log-step">#{entry.n}</span>
      <ThreadChip tid={entry.thread} color={threadColors[entry.thread]} />
      <span className="log-code">line {entry.line}: <code>{entry.code}</code></span>
      <span className="log-explain">{entry.explain}</span>
    </li>
  );
}
