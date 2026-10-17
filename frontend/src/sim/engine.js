// engine.js
// The simulation engine. It runs the lock programs from programs.js one step
// at a time and keeps everything in one plain "sim" object:
//
//   sim.shared    the shared variables (the lock's variables and counter)
//   sim.threads   one entry per thread: program counter (pc), status,
//                 private variables, iterations finished, and a store buffer
//   sim.log       one line per action that was run
//   sim.violations  every moment two or more threads were in the critical
//                 section together (a mutual-exclusion violation)
//   sim.rng       the state of the seeded random generator
//   sim.sc        "sequentially consistent": for locks that use the store
//                 buffer (PetersonRelaxedLock), flush right after each store
//
// There are two kinds of action:
//   step(sim, tid)    thread tid runs its next line of pseudo-code
//   flush(sim, tid)   thread tid's store buffer is written to shared memory
// Both return a NEW sim object (the old one is not changed), so React can
// keep the previous state and the tests can compare runs.
//
// This is an illustration of the algorithms, not a measurement: one action
// is one line of pseudo-code (or one flush), and the scheduler decides what
// happens next.

import { CS_STEPS, LOCK_PROGRAMS } from "./programs.js";
import { nextRandom, seedToState } from "./rng.js";

// Thread statuses.
export const IDLE = "idle";
export const WAITING = "waiting";
export const SLEEPING = "sleeping";   // asleep in a queue; cannot be scheduled
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
// section (the common one, or the lock's own, e.g. a single fetch_add for
// "atomic"), then its unlock() steps. Each step gets a "section" name.
const programCache = {};

export function getProgram(lockName) {
  if (!programCache[lockName]) {
    const lock = LOCK_PROGRAMS[lockName];
    const csSteps = lock.cs || CS_STEPS;
    const steps = [];
    for (const s of lock.lock) steps.push({ ...s, section: "lock" });
    for (const s of csSteps) steps.push({ ...s, section: "cs" });
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

// options: { lock, threads, iterations, seed, sc }
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
      buffer: [],          // store buffer: [{ name, index, value }], oldest first
    });
  }

  const shared = lock.init(threadCount);
  shared.counter = 0;

  return {
    lock: options.lock,
    threadCount: threadCount,
    iterations: options.iterations === undefined ? 2 : options.iterations,
    seed: seed,
    sc: options.sc === true,
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
// The store buffer (used only by locks that call ctx.store / ctx.load)
// ---------------------------------------------------------------------------

// "flag[0]" or "turn"
function varName(name, index) {
  return index === null ? name : name + "[" + index + "]";
}

// What thread "thread" sees when it loads name[index]: its own newest
// buffered store to that variable if there is one, else shared memory.
function loadValue(sim, thread, name, index) {
  for (let k = thread.buffer.length - 1; k >= 0; k--) {
    const entry = thread.buffer[k];
    if (entry.name === name && entry.index === index) return entry.value;
  }
  return index === null ? sim.shared[name] : sim.shared[name][index];
}

function writeShared(sim, name, index, value) {
  if (index === null) {
    sim.shared[name] = value;
  } else {
    sim.shared[name][index] = value;
  }
}

// ---------------------------------------------------------------------------
// Running one step
// ---------------------------------------------------------------------------

// Runs the next step of thread tid and returns the new sim. If that thread
// cannot run (done or asleep), the sim is returned unchanged.
export function step(sim, tid) {
  const next = structuredClone(sim);
  stepInPlace(next, tid);
  return next;
}

// The same as step(), but changes "sim" itself. Used inside the engine and
// by runToEnd(), where copying after every step would be slow.
function stepInPlace(sim, tid) {
  const thread = sim.threads[tid];
  if (thread.status === DONE || thread.status === SLEEPING) {
    return false;
  }
  const program = getProgram(sim.lock);
  const current = program[thread.pc];

  // The things a step can do. Every write is remembered in "changed" so
  // the page can highlight it.
  const changed = [];
  const ctx = {
    me: tid,
    other: 1 - tid,
    n: sim.threadCount,
    local: thread.local,
    // Plain shared memory: reads and writes take effect at once.
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
    // Through the store buffer: a store waits in this thread's buffer until
    // it is flushed (or at once if sim.sc is on); a load sees this thread's
    // own buffered stores first.
    load: (name) => loadValue(sim, thread, name, null),
    loadAt: (name, i) => loadValue(sim, thread, name, i),
    store: (name, value) => bufferedStore(sim, thread, name, null, value, changed),
    storeAt: (name, i, value) => bufferedStore(sim, thread, name, i, value, changed),
    // Wake a sleeping thread (it will try its lock step again).
    wake: (otherTid) => {
      sim.threads[otherTid].status = WAITING;
      changed.push("T" + otherTid + " woken");
    },
  };

  const result = current.run(ctx);
  const lineNumber = thread.pc + 1;

  sim.stepCount = sim.stepCount + 1;
  sim.lastThread = tid;

  if (result.sleep) {
    // Stay on this line, asleep, until another thread wakes it.
    thread.status = SLEEPING;
  } else {
    // Work out the next step.
    let nextPc;
    if (result.spin) {
      nextPc = thread.pc;
    } else if (result.goto) {
      nextPc = labelIndex(program, result.goto);
    } else {
      nextPc = thread.pc + 1;
    }

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
  }

  sim.log.push({
    n: sim.stepCount,
    action: "step",
    thread: tid,
    line: lineNumber,
    code: current.code,
    explain: "Thread " + tid + " " + result.explain,
    changed: changed,
  });

  checkMutualExclusion(sim);
  return true;
}

// A store through the store buffer.
function bufferedStore(sim, thread, name, index, value, changed) {
  if (sim.sc) {
    // Sequentially consistent: the store reaches shared memory at once.
    writeShared(sim, name, index, value);
    changed.push(varName(name, index));
  } else {
    thread.buffer.push({ name: name, index: index, value: value });
    changed.push("buffer T" + thread.id);
  }
}

// Writes thread tid's whole store buffer to shared memory, oldest first.
export function flush(sim, tid) {
  const next = structuredClone(sim);
  flushInPlace(next, tid);
  return next;
}

function flushInPlace(sim, tid) {
  const thread = sim.threads[tid];
  if (thread.buffer.length === 0) {
    return false;
  }
  const changed = [];
  const written = [];
  for (const entry of thread.buffer) {
    writeShared(sim, entry.name, entry.index, entry.value);
    changed.push(varName(entry.name, entry.index));
    written.push(varName(entry.name, entry.index) + " = " + entry.value);
  }
  thread.buffer = [];
  changed.push("buffer T" + tid);

  sim.stepCount = sim.stepCount + 1;
  sim.lastThread = tid;
  sim.log.push({
    n: sim.stepCount,
    action: "flush",
    thread: tid,
    line: null,
    code: "flush store buffer",
    explain: "Thread " + tid + " flushes its store buffer: " + written.join(", ") +
      " now in shared memory, visible to the other threads.",
    changed: changed,
  });
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

// Threads that can take a step now (not done, not asleep).
export function runnableThreads(sim) {
  return sim.threads.filter((t) => t.status !== DONE && t.status !== SLEEPING).map((t) => t.id);
}

export function isFinished(sim) {
  return sim.threads.every((t) => t.status === DONE);
}

// The counter value a correct lock must reach.
export function expectedCounter(sim) {
  return sim.threadCount * sim.iterations;
}

// Everything that could happen next: a step of any runnable thread, or a
// flush of any non-empty store buffer. Each is { type, tid }.
export function availableActions(sim) {
  const actions = [];
  for (const tid of runnableThreads(sim)) {
    actions.push({ type: "step", tid: tid });
  }
  for (const t of sim.threads) {
    if (t.buffer.length > 0) actions.push({ type: "flush", tid: t.id });
  }
  return actions;
}

// Runs one action (from availableActions, a replay script or a button).
export function applyAction(sim, action) {
  return action.type === "flush" ? flush(sim, action.tid) : step(sim, action.tid);
}

function applyInPlace(sim, action) {
  if (action.type === "flush") {
    flushInPlace(sim, action.tid);
  } else {
    stepInPlace(sim, action.tid);
  }
}

// Picks the next action for "round robin" or "random" (changes sim.rng in
// random mode). Returns null in manual mode or if nothing can happen.
function chooseInPlace(sim, mode) {
  const actions = availableActions(sim);
  if (actions.length === 0 || mode === MANUAL) {
    return null;
  }
  if (mode === ROUND_ROBIN) {
    // The next thread after the one that acted last that can do anything.
    // On its turn it flushes its buffer if that is not empty, else steps.
    for (let k = 1; k <= sim.threadCount; k++) {
      const tid = (sim.lastThread + k) % sim.threadCount;
      const own = actions.filter((a) => a.tid === tid);
      if (own.length > 0) {
        return own.find((a) => a.type === "flush") || own[0];
      }
    }
    return actions[0];
  }
  // RANDOM: one draw from the seeded generator over all possible actions.
  const draw = nextRandom(sim.rng);
  sim.rng = draw.state;
  return actions[Math.floor(draw.value * actions.length)];
}

// Lets the scheduler choose an action and runs it.
export function scheduleStep(sim, mode) {
  const next = structuredClone(sim);
  const action = chooseInPlace(next, mode);
  if (action) {
    applyInPlace(next, action);
  }
  return next;
}

// Runs until every thread is done (or maxSteps actions, or nothing can
// happen any more). Used by the tests.
export function runToEnd(sim, mode, maxSteps) {
  const limit = maxSteps === undefined ? 100000 : maxSteps;
  const next = structuredClone(sim);
  let count = 0;
  while (!isFinished(next) && count < limit) {
    const action = chooseInPlace(next, mode);
    if (!action) break;
    applyInPlace(next, action);
    count++;
  }
  return next;
}

// Runs a fixed list of actions (a preset or a replayed run).
export function runScript(sim, actions) {
  const next = structuredClone(sim);
  for (const action of actions) {
    applyInPlace(next, action);
  }
  return next;
}
