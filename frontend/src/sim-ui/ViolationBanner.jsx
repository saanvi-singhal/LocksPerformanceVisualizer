// ViolationBanner.jsx
// The red banner shown when two or more threads are in the critical section
// at the same time, with the log lines that led to it. role="alert" makes
// screen readers announce it at once.
import { LogLine } from "./EventLog.jsx";

// Props: violation (the latest one), count (how many so far), threadColors.
export function ViolationBanner({ violation, count, threadColors }) {
  const names = violation.threads.map((t) => "T" + t).join(" and ");
  return (
    <div className="violation" role="alert">
      <p className="violation-title">
        <span aria-hidden="true">✗ </span>
        Mutual exclusion violated at step {violation.step}: {names} are in the critical section
        at the same time.
        {count > 1 && " (" + count + " violations so far; this is the latest.)"}
      </p>
      <p className="violation-sub">The steps that led to it:</p>
      <ol className="event-log">
        {violation.lines.map((entry) => <LogLine key={entry.n} entry={entry} threadColors={threadColors} />)}
      </ol>
    </div>
  );
}
