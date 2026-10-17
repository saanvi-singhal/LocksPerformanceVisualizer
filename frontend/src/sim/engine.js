// engine.js
// The simulation engine. It runs the lock programs from programs.js one step
// at a time and keeps everything in one plain "sim" object:
//
//   sim.shared    the shared variables (the lock's variables and counter)
//   sim.threads   one entry per thread: program counter (pc), status,
//                 private variables, how many iterations it has finished
//   sim.log       one line per step that was run
//   sim.violations  every moment two or more threads were in the critical
//                 section together (a mutual-exclusion violation)
//   sim.rng       the state of the seeded random generator
//
// step(sim, tid) returns a NEW sim object (the old one is not changed), so
// React can keep the previous state and the tests can compare runs.
//
// This is an illustration of the algorithms, not a measurement: one "step"
// is one line of pseudo-code, and the scheduler decides who runs next.

import { CS_STEPS, LOCK_PROGRAMS } from "./programs.js";
import { nextRandom, seedToState } from "./rng.js";

export const IDLE = "idle";
export const WAITING = "waiting";
export const IN_CS = "in critical section";
export const DONE = "done";

// Scheduler modes.
export const MANUAL = "manual";
export const ROUND_ROBIN = "round robin";
export const RANDOM = "random";

// How many log lines to keep in a violation report.
const VIOLATION_LINES = 12;

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

// The full list of steps for one lock: its lock() steps, the critical
// section, then its unlock() steps. Each step gets a "section" name.
const programCache = {};

export function getProgram(lockName) {
  if (!programCache[lockName]) {
    const lock = LOCK_PROGRAMS[lockName];
    const steps = [];
    for (const s of lock.lock) steps.push({ ...s, section: "lock" });
    for (const s of CS_STEPS) steps.push({ ...s, section: "cs" });
    for (const s of lock.unlock) steps.push({ ...s, section: "unlock" });
    programCache[lockName] = steps;
  }
  return programCache[lockName];
}

// Index of the step with the given label. "cs" means the first step of the
// critical section.
function labelIndex(program, label) {
  for (let i = 0; i < program.length; i++) {
    if (label === "cs" && program[i].section === "cs") return i;
    if (program[i].label === label) return i;
  }
  throw new Error("unknown step label: " + label);
}

// ---------------------------------------------------------------------------
// Creating a simulation
// ---------------------------------------------------------------------------

// options: { lock, threads, iterations, seed }
export function createSim(options) {
  const lock = LOCK_PROGRAMS[options.lock];
  if (!lock) {
    throw new Error("unknown lock: " + options.lock);
  }
  const threadCount = options.threads;
  if (threadCount < lock.minThreads || threadCount > lock.maxThreads) {
    throw new Error(lock.title + " supports " + lock.minThreads + " to " + lock.maxThreads + " threads");
  }
  const seed = options.seed === undefined ? 1 : options.seed;

  const threads = [];
  for (let i = 0; i < threadCount; i++) {
    threads.push({
      id: i,
      pc: 0,               // index of the next step in the program
      status: IDLE,
      local: {},           // private variables, e.g. tmp or my_ticket
      finished: 0,         // iterations (lock ... unlock) completed
      enteredAt: 0,        // step number at which it last entered the CS
    });
  }

  const shared = lock.init(threadCount);
  shared.counter = 0;

  return {
    lock: options.lock,
    threadCount: threadCount,
    iterations: options.iterations === undefined ? 2 : options.iterations,
    seed: seed,
    rng: seedToState(seed),
    shared: shared,
    threads: threads,
    stepCount: 0,
    lastThread: -1,
    log: [],
    violations: [],
    inViolation: false,
  };
}

// ---------------------------------------------------------------------------
// Running one step
// ---------------------------------------------------------------------------

// Runs the next step of thread tid and returns the new sim. If that thread
// cannot run (it is done), the sim is returned unchanged.
export function step(sim, tid) {
  const next = structuredClone(sim);
  stepInPlace(next, tid);
  return next;
}

// The same as step(), but changes "sim" itself. Used inside the engine and
// by runToEnd(), where copying after every step would be slow.
function stepInPlace(sim, tid) {
  const thread = sim.threads[tid];
  if (thread.status === DONE) {
    return false;
  }
  const program = getProgram(sim.lock);
  const current = program[thread.pc];

  // The things a step can do, with every write remembered in "changed"
  // so the page can highlight it.
  const changed = [];
  const ctx = {
    me: tid,
    other: 1 - tid,
    n: sim.threadCount,
    local: thread.local,
    get: (name) => sim.shared[name],
    set: (name, value) => {
      sim.shared[name] = value;
      changed.push(name);
    },
    getAt: (name, i) => sim.shared[name][i],
    setAt: (name, i, value) => {
      sim.shared[name][i] = value;
      changed.push(name + "[" + i + "]");
    },
  };

  const result = current.run(ctx);
  const lineNumber = thread.pc + 1;

  // Work out the next step.
  let nextPc;
  if (result.spin) {
    nextPc = thread.pc;
  } else if (result.goto) {
    nextPc = labelIndex(program, result.goto);
  } else {
    nextPc = thread.pc + 1;
  }

  sim.stepCount = sim.stepCount + 1;
  sim.lastThread = tid;

  if (nextPc >= program.length) {
    // The last unlock() step is done: one iteration finished.
    thread.finished = thread.finished + 1;
    thread.local = {};
    thread.pc = 0;
    thread.status = thread.finished >= sim.iterations ? DONE : IDLE;
  } else {
    const wasInCs = thread.status === IN_CS;
    thread.pc = nextPc;
    if (program[nextPc].section === "lock") {
      thread.status = WAITING;
    } else {
      thread.status = IN_CS;
      if (!wasInCs) {
        thread.enteredAt = sim.stepCount;
      }
    }
  }

  sim.log.push({
    n: sim.stepCount,
    thread: tid,
    line: lineNumber,
    code: current.code,
    explain: "Thread " + tid + " " + result.explain,
    changed: changed,
  });

  checkMutualExclusion(sim);
  return true;
}

// Records a violation the moment a second thread joins the critical section.
function checkMutualExclusion(sim) {
  const inside = sim.threads.filter((t) => t.status === IN_CS);
  if (inside.length > 1 && !sim.inViolation) {
    // The log lines from the earliest of these threads entering until now.
    let firstEntry = sim.stepCount;
    for (const t of inside) {
      firstEntry = Math.min(firstEntry, t.enteredAt);
    }
    const lines = sim.log.filter((entry) => entry.n >= firstEntry - 1).slice(-VIOLATION_LINES);
    sim.violations.push({
      step: sim.stepCount,
      threads: inside.map((t) => t.id),
      lines: lines,
    });
  }
  sim.inViolation = inside.length > 1;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

// Threads that can take a step now.
export function runnableThreads(sim) {
  return sim.threads.filter((t) => t.status !== DONE).map((t) => t.id);
}

export function isFinished(sim) {
  return runnableThreads(sim).length === 0;
}

// The counter value a correct lock must reach.
export function expectedCounter(sim) {
  return sim.threadCount * sim.iterations;
}

// Picks the next thread for the "round robin" or "random" mode (changes
// sim.rng in random mode). Returns -1 in manual mode or if nobody can run.
function chooseInPlace(sim, mode) {
  const runnable = runnableThreads(sim);
  if (runnable.length === 0 || mode === MANUAL) {
    return -1;
  }
  if (mode === ROUND_ROBIN) {
    // The first runnable thread after the one that ran last.
    for (let k = 1; k <= sim.threadCount; k++) {
      const tid = (sim.lastThread + k) % sim.threadCount;
      if (runnable.includes(tid)) return tid;
    }
    return runnable[0];
  }
  // RANDOM: one draw from the seeded generator.
  const draw = nextRandom(sim.rng);
  sim.rng = draw.state;
  return runnable[Math.floor(draw.value * runnable.length)];
}

// Lets the scheduler choose a thread and runs one step of it.
export function scheduleStep(sim, mode) {
  const next = structuredClone(sim);
  const tid = chooseInPlace(next, mode);
  if (tid >= 0) {
    stepInPlace(next, tid);
  }
  return next;
}

// Runs until every thread is done (or maxSteps steps). Used by the tests.
export function runToEnd(sim, mode, maxSteps) {
  const limit = maxSteps === undefined ? 100000 : maxSteps;
  const next = structuredClone(sim);
  let count = 0;
  while (!isFinished(next) && count < limit) {
    const tid = chooseInPlace(next, mode);
    if (tid < 0) break;
    stepInPlace(next, tid);
    count++;
  }
  return next;
}
