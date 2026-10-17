// CorrectnessTable.jsx
// One row per lock, one column per thread count. Each cell shows how many
// runs were correct (over all three critical-section lengths), with an icon
// and text, so the result never depends on colour alone.
import { BROKEN_LOCKS, LOCK_ORDER, lockLabel } from "../locks.js";

export function CorrectnessTable({ correctness, threadCounts }) {
  // Look up a cell quickly: key "lock/threads".
  const cells = {};
  for (const row of correctness) {
    cells[row.lock + "/" + row.threads] = row;
  }
  const locks = LOCK_ORDER.filter((lock) => correctness.some((row) => row.lock === lock));

  return (
    <div className="table-scroll">
      <table className="data-table correctness">
        <thead>
          <tr>
            <th scope="col">lock \ threads</th>
            {threadCounts.map((t) => <th scope="col" key={t}>{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {locks.map((lock) => (
            <tr key={lock}>
              <th scope="row">{lockLabel(lock)}</th>
              {threadCounts.map((t) => (
                <td key={t}>{renderCell(cells[lock + "/" + t], BROKEN_LOCKS.includes(lock))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(cell, broken) {
  if (!cell) {
    // For example Peterson at anything other than 2 threads.
    return <span className="cell-na" title="not supported">–</span>;
  }
  const text = cell.correct_runs + "/" + cell.runs;
  if (cell.correct_runs === cell.runs) {
    return <span className="cell-good">✓ {text}</span>;
  }
  return (
    <span className={broken ? "cell-expected" : "cell-bad"}>
      ✗ {text}{broken ? " (expected)" : ""}
    </span>
  );
}
