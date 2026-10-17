// CompareLocks.jsx
// "ticket is 1.6x faster than tas at 8 threads (empty critical section)":
// one sentence comparing the throughput of two locks chosen from dropdowns,
// at the thread count and critical section chosen under Performance.
import { useState } from "react";

import { lockLabel } from "../locks.js";
import { shortNumber } from "../format.js";

// Below this difference (5%) two locks are called "about as fast".
const SAME_SPEED = 1.05;

export function CompareLocks({ locks, value, threads, cs, threadLabel }) {
  const [chosenA, setLockA] = useState("ticket");
  const [chosenB, setLockB] = useState("tas");
  // If a chosen lock is no longer listed (e.g. broken locks were switched
  // off), fall back to the first listed lock.
  const lockA = locks.includes(chosenA) ? chosenA : locks[0];
  const lockB = locks.includes(chosenB) ? chosenB : locks[0];

  return (
    <div className="compare">
      <div className="compare-controls">
        <label>
          Compare
          <select value={lockA} onChange={(e) => setLockA(e.target.value)}>
            {locks.map((l) => <option key={l} value={l}>{lockLabel(l)}</option>)}
          </select>
        </label>
        <label>
          with
          <select value={lockB} onChange={(e) => setLockB(e.target.value)}>
            {locks.map((l) => <option key={l} value={l}>{lockLabel(l)}</option>)}
          </select>
        </label>
      </div>
      {/* aria-live: screen readers announce the new sentence when it changes. */}
      <p className="compare-sentence" aria-live="polite">
        {sentence(lockA, lockB, value, threads, cs, threadLabel)}
      </p>
    </div>
  );
}

function sentence(lockA, lockB, value, threads, cs, threadLabel) {
  const where = "at " + threadLabel(threads) + " threads (" + cs + " critical section)";
  if (lockA === lockB) {
    return "Pick two different locks to compare.";
  }
  const a = value(lockA, threads, cs, "ops_per_sec");
  const b = value(lockB, threads, cs, "ops_per_sec");
  if (a == null || b == null) {
    const missing = a == null ? lockA : lockB;
    return "No measurement for " + lockLabel(missing) + " " + where +
      (missing.startsWith("peterson") ? " (Peterson only runs with 2 threads)." : ".");
  }

  const numbers = " (" + shortNumber(a) + " vs " + shortNumber(b) + " ops/s)";
  const ratio = a / b;
  if (ratio >= SAME_SPEED) {
    return lockLabel(lockA) + " is " + times(ratio) + " faster than " + lockLabel(lockB) + " " + where + numbers + ".";
  }
  if (ratio <= 1 / SAME_SPEED) {
    return lockLabel(lockA) + " is " + times(1 / ratio) + " slower than " + lockLabel(lockB) + " " + where + numbers + ".";
  }
  return lockLabel(lockA) + " is about as fast as " + lockLabel(lockB) + " " + where + numbers + ".";
}

// 1.63 -> "1.6x", 2750 -> "2750x".
function times(ratio) {
  return (ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)) + "×";
}
