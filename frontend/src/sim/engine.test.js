// engine.test.js
// Unit tests for the simulation engine. Run with:  npm test
// (uses Node's built-in test runner, no extra packages).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  acquisitionsPer100, createSim, expectedCounter, flush, isFinished, parseAction, runRounds, runScript,
  runToEnd, runnableThreads, scheduleStep, step, RANDOM, ROUND_ROBIN, IN_CS, SLEEPING, WAITING,
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

// ---- PetersonRelaxedLock and the store-buffer model -----------------------

const relaxed = LOCK_PROGRAMS.peterson_relaxed;
const presetActions = relaxed.preset.actions.map(parseAction);

test("store buffer: a store is invisible to others until flushed, but visible to its own loads", () => {
  let sim = createSim({ lock: "peterson_relaxed", threads: 2, iterations: 1 });
  sim = step(sim, 0);                                   // T0: flag[0] = true (buffered)
  assert.equal(sim.shared.flag[0], false);              // not in shared memory yet
  assert.deepEqual(sim.threads[0].buffer, [{ name: "flag", index: 0, value: true }]);
  sim = flush(sim, 0);
  assert.equal(sim.shared.flag[0], true);               // now it is
  assert.deepEqual(sim.threads[0].buffer, []);

  // Own loads see own buffered stores: T0 does a whole iteration without
  // flushing (counter = 1 stays in its buffer), then reads counter again.
  let own = createSim({ lock: "peterson_relaxed", threads: 2, iterations: 2 });
  for (let i = 0; i < 7; i++) own = step(own, 0);       // flag, turn, check, read, add, write, unlock
  for (let i = 0; i < 4; i++) own = step(own, 0);       // flag, turn, check, tmp = counter
  assert.equal(own.shared.counter, 0);                  // shared memory still says 0
  assert.equal(own.threads[0].local.tmp, 1);            // but T0 read its own buffered 1
});

test("PetersonRelaxed: the preset schedule makes both threads enter the critical section", () => {
  const sim = runScript(createSim({ lock: "peterson_relaxed", threads: 2, iterations: relaxed.preset.iterations }), presetActions);
  assert.equal(sim.violations.length, 1);
  assert.deepEqual(sim.violations[0].threads, [0, 1]);
  assert.equal(sim.violations[0].step, presetActions.length);   // at the last preset step
  // The report starts at the first buffered store, so it shows the cause.
  assert.deepEqual(sim.violations[0].lines.map((entry) => entry.n), [1, 2, 3, 4, 5, 6]);
});

test("PetersonRelaxed: with 'sequentially consistent' on, the same preset lets only one thread in", () => {
  let sim = runScript(createSim({ lock: "peterson_relaxed", threads: 2, iterations: 1, sc: true }), presetActions);
  assert.equal(sim.violations.length, 0);
  sim = runToEnd(sim, ROUND_ROBIN);
  assert.ok(isFinished(sim));
  assert.equal(sim.violations.length, 0);
  assert.equal(sim.shared.counter, 2);
});

test("PetersonRelaxed with 'sequentially consistent' on never violates over 1000 random seeds", () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const sim = runToEnd(createSim({ lock: "peterson_relaxed", threads: 2, iterations: 3, seed: seed, sc: true }), RANDOM);
    assert.ok(isFinished(sim), "seed " + seed + " did not finish");
    assert.equal(sim.violations.length, 0, "seed " + seed + " violated mutual exclusion");
    assert.equal(sim.shared.counter, expectedCounter(sim), "seed " + seed + " lost an update");
  }
});

test("PetersonRelaxed without it violates in some random runs", () => {
  let violating = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const sim = runToEnd(createSim({ lock: "peterson_relaxed", threads: 2, iterations: 3, seed: seed }), RANDOM);
    assert.ok(isFinished(sim), "seed " + seed + " did not finish");
    if (sim.violations.length > 0) violating++;
  }
  assert.ok(violating > 0);
  console.log("  PetersonRelaxed (store buffer, random): " + violating + "/" + SEEDS + " runs violated mutual exclusion");
});

// ---- Cores and oversubscription mode -------------------------------------

const ROUNDS = 1000;

// Acquisitions per 100 rounds for one lock, threads looping for ever.
function per100(lock, threads, cores, mode, seed) {
  const sim = runRounds(
    createSim({ lock: lock, threads: threads, iterations: Infinity, seed: seed, logLimit: 50 }),
    cores, mode, ROUNDS
  );
  assert.equal(sim.violations.length, 0, lock + " violated mutual exclusion in the cores mode");
  return acquisitionsPer100(sim);
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Ticket vs semaphore over 200 seeds: [ticket values, semaphore values, seeds where ticket < semaphore].
function compareTicketSemaphore(threads, cores) {
  const ticket = [];
  const semaphore = [];
  let ticketLess = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const t = per100("ticket", threads, cores, RANDOM, seed);
    const s = per100("semaphore", threads, cores, RANDOM, seed);
    ticket.push(t);
    semaphore.push(s);
    if (t < s) ticketLess++;
  }
  return { ticket, semaphore, ticketLess };
}

test("cores mode: one round runs at most 'cores' threads, one step each, and never a sleeping thread", () => {
  let sim = createSim({ lock: "semaphore", threads: 8, iterations: Infinity, logLimit: 50 });
  let sawSleepers = false;
  for (let r = 0; r < 200; r++) {
    const before = sim.stepCount;
    const asleep = sim.threads.filter((t) => t.status === SLEEPING).map((t) => t.id);
    if (asleep.length > 0) sawSleepers = true;
    sim = runRounds(sim, 4, RANDOM, 1);
    for (const tid of sim.onCores) {
      assert.ok(!asleep.includes(tid), "sleeping thread " + tid + " was given a core");
    }
    assert.ok(sim.onCores.length <= 4);
    assert.equal(sim.stepCount - before, sim.onCores.length);   // one step per running thread
    assert.equal(new Set(sim.onCores).size, sim.onCores.length); // no thread twice
  }
  assert.ok(sawSleepers, "the test never had a sleeping thread to check");
});

test("cores mode, 8 threads on 4 cores: ticket completes fewer acquisitions per 100 rounds than semaphore", () => {
  const r = compareTicketSemaphore(8, 4);
  console.log("  8 threads, 4 cores, 200 seeds: median per 100 rounds ticket = " + median(r.ticket).toFixed(1) +
    ", semaphore = " + median(r.semaphore).toFixed(1) + "; ticket < semaphore in " + r.ticketLess + "/200 seeds");
  assert.ok(r.ticketLess > 100, "ticket was slower in only " + r.ticketLess + "/200 seeds");
});

test("cores mode, cores >= threads: the ticket lock does not collapse", () => {
  for (const [threads, cores] of [[8, 8], [4, 4]]) {
    const r = compareTicketSemaphore(threads, cores);
    let ticketAtLeast = 0;
    for (let i = 0; i < 200; i++) {
      if (r.ticket[i] >= r.semaphore[i]) ticketAtLeast++;
    }
    console.log("  " + threads + " threads, " + cores + " cores, 200 seeds: median per 100 rounds ticket = " +
      median(r.ticket).toFixed(1) + ", semaphore = " + median(r.semaphore).toFixed(1) +
      "; ticket >= semaphore in " + ticketAtLeast + "/200 seeds");
    assert.ok(ticketAtLeast > 100, "with " + cores + " cores ticket kept up in only " + ticketAtLeast + "/200 seeds");
  }
});

test("cores mode: every correct lock stays correct (counter matches completed acquisitions)", () => {
  const correctLocks = Object.values(LOCK_PROGRAMS).filter((lock) => !lock.broken && lock.maxThreads >= 8);
  for (const lock of correctLocks) {
    for (let seed = 1; seed <= 20; seed++) {
      const sim = runRounds(createSim({ lock: lock.name, threads: 8, iterations: Infinity, seed: seed, logLimit: 50 }), 4, RANDOM, 300);
      assert.equal(sim.violations.length, 0, lock.name + " seed " + seed + " violated");
      // The counter can be one ahead: a thread may have written it but not unlocked yet.
      const ahead = sim.shared.counter - sim.completed;
      assert.ok(ahead === 0 || ahead === 1, lock.name + " seed " + seed + ": counter " + sim.shared.counter +
        " vs " + sim.completed + " completed");
      assert.ok(sim.completed > 0, lock.name + " seed " + seed + " made no progress");
    }
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
