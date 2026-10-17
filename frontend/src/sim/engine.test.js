// engine.test.js
// Unit tests for the simulation engine. Run with:  npm test
// (uses Node's built-in test runner, no extra packages).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createSim, expectedCounter, isFinished, runToEnd, runnableThreads, scheduleStep, step,
  RANDOM, ROUND_ROBIN, IN_CS, SLEEPING, WAITING,
} from "./engine.js";
import { LOCK_PROGRAMS } from "./programs.js";

const SEEDS = 1000;

test("Peterson never violates mutual exclusion over 1000 random seeds", () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const sim = runToEnd(createSim({ lock: "peterson", threads: 2, iterations: 3, seed: seed }), RANDOM);
    assert.ok(isFinished(sim), "seed " + seed + " did not finish");
    assert.equal(sim.violations.length, 0, "seed " + seed + " violated mutual exclusion");
    assert.equal(sim.shared.counter, expectedCounter(sim), "seed " + seed + " lost an update");
  }
});

test("NoLock violates mutual exclusion and loses updates", () => {
  let violatingRuns = 0;
  let lostUpdateRuns = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const sim = runToEnd(createSim({ lock: "none", threads: 2, iterations: 3, seed: seed }), RANDOM);
    if (sim.violations.length > 0) violatingRuns++;
    if (sim.shared.counter < expectedCounter(sim)) lostUpdateRuns++;
  }
  assert.ok(violatingRuns > 0, "NoLock never violated mutual exclusion");
  assert.ok(lostUpdateRuns > 0, "NoLock never lost an update");
  console.log("  NoLock: " + violatingRuns + "/" + SEEDS + " runs violated mutual exclusion, " +
    lostUpdateRuns + "/" + SEEDS + " lost an update");
});

test("NoLock violates even with round robin, and the report holds the log lines", () => {
  const sim = runToEnd(createSim({ lock: "none", threads: 2, iterations: 1 }), ROUND_ROBIN);
  assert.ok(sim.violations.length > 0);
  const report = sim.violations[0];
  assert.deepEqual(report.threads, [0, 1]);
  assert.ok(report.lines.length > 0);
});

test("every correct lock reaches the right counter with no violation", () => {
  const correctLocks = Object.values(LOCK_PROGRAMS).filter((lock) => !lock.broken);
  for (const lock of correctLocks) {
    for (let threads = lock.minThreads; threads <= lock.maxThreads; threads++) {
      for (let seed = 1; seed <= 200; seed++) {
        const sim = runToEnd(createSim({ lock: lock.name, threads: threads, iterations: 3, seed: seed }), RANDOM);
        const where = lock.name + ", " + threads + " threads, seed " + seed;
        assert.ok(isFinished(sim), where + " did not finish");
        assert.equal(sim.violations.length, 0, where + " violated mutual exclusion");
        assert.equal(sim.shared.counter, expectedCounter(sim), where + " counter is wrong");
      }
      // Round robin as well.
      const rr = runToEnd(createSim({ lock: lock.name, threads: threads, iterations: 3 }), ROUND_ROBIN);
      assert.equal(rr.shared.counter, expectedCounter(rr), lock.name + " round robin counter is wrong");
    }
  }
});

test("the correct-lock test above covers every new lock", () => {
  const correct = Object.values(LOCK_PROGRAMS).filter((lock) => !lock.broken).map((lock) => lock.name);
  for (const name of ["mutex", "semaphore", "tas", "ttas", "ticket", "peterson", "bakery", "atomic"]) {
    assert.ok(correct.includes(name), name + " is not tested as a correct lock");
  }
});

for (const name of ["semaphore", "mutex"]) {
  test(name + ": a waiting thread sleeps, is not runnable, and is woken by unlock", () => {
    let sim = createSim({ lock: name, threads: 2, iterations: 1 });
    sim = step(sim, 0);                       // T0 takes the lock
    assert.equal(sim.threads[0].status, IN_CS);
    sim = step(sim, 1);                       // T1 finds it taken and sleeps
    assert.equal(sim.threads[1].status, SLEEPING);
    assert.deepEqual(runnableThreads(sim), [0]);
    const before = sim.stepCount;
    sim = step(sim, 1);                       // a sleeping thread cannot step
    assert.equal(sim.stepCount, before);
    for (let i = 0; i < 4; i++) sim = step(sim, 0);   // T0: read, add, write, unlock
    assert.equal(sim.threads[1].status, WAITING);    // woken by unlock
    sim = runToEnd(sim, ROUND_ROBIN);
    assert.ok(isFinished(sim));
    assert.equal(sim.shared.counter, 2);
  });
}

test("atomic: the increment is one step and never loses an update", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const sim = runToEnd(createSim({ lock: "atomic", threads: 4, iterations: 5, seed: seed }), RANDOM);
    assert.equal(sim.shared.counter, 20);
    assert.equal(sim.log.length, 20);   // one step per increment
  }
});

test("the same seed gives exactly the same run (replay)", () => {
  const a = runToEnd(createSim({ lock: "ticket", threads: 3, iterations: 2, seed: 42 }), RANDOM);
  const b = runToEnd(createSim({ lock: "ticket", threads: 3, iterations: 2, seed: 42 }), RANDOM);
  assert.deepEqual(a.log, b.log);
  const c = runToEnd(createSim({ lock: "ticket", threads: 3, iterations: 2, seed: 43 }), RANDOM);
  assert.notDeepEqual(a.log, c.log);
});

test("step() does not change the old state, and a done thread cannot step", () => {
  const start = createSim({ lock: "tas", threads: 2, iterations: 1 });
  const after = step(start, 0);
  assert.equal(start.stepCount, 0);
  assert.equal(after.stepCount, 1);
  assert.equal(after.shared.locked, true);

  const finished = runToEnd(start, ROUND_ROBIN);
  assert.deepEqual(step(finished, 0).log, finished.log);
});

test("ticket lock: threads enter the critical section in ticket order", () => {
  for (let seed = 1; seed <= 200; seed++) {
    let sim = createSim({ lock: "ticket", threads: 4, iterations: 2, seed: seed });
    const entryTickets = [];
    while (!isFinished(sim)) {
      const before = sim.threads.map((t) => t.status);
      sim = scheduleStep(sim, RANDOM);
      const tid = sim.lastThread;
      if (before[tid] !== IN_CS && sim.threads[tid].status === IN_CS) {
        entryTickets.push(sim.threads[tid].local.my_ticket);
      }
    }
    const sorted = entryTickets.slice().sort((x, y) => x - y);
    assert.deepEqual(entryTickets, sorted, "seed " + seed + " entered out of ticket order");
  }
});
