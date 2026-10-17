// programs.js
// Every lock written as a small "program": a list of steps for lock() and a
// list of steps for unlock(). One step is one visible action, for example
// "flag[me] = true" or "my_ticket = fetch_add(next_ticket, 1)".
//
// A step is an object:
//   code   the pseudo-code line shown on screen
//   label  (optional) a name other steps can jump to
//   run    a function that does the action. It gets a "ctx" object:
//            ctx.me, ctx.other, ctx.n       this thread's id, the other
//                                           thread (2-thread locks), N
//            ctx.get(name)                  read a shared variable
//            ctx.set(name, value)           write a shared variable
//            ctx.getAt(name, i)             read element i of a shared array
//            ctx.setAt(name, i, value)      write element i of a shared array
//            ctx.local                      this thread's private variables
//            ctx.wake(tid)                  wake a sleeping thread
//            ctx.store / storeAt / load / loadAt   the same as set/get, but
//                                           through the store buffer (only
//                                           PetersonRelaxedLock uses them)
//          and returns { explain, goto, spin, sleep }:
//            explain  one plain-English sentence for the event log
//            goto     (optional) label of the next step; default: the next line
//            spin     (optional) true = stay on this same step (busy wait)
//            sleep    (optional) true = go to sleep on this step; the thread
//                     cannot be scheduled until another thread wakes it
//
// Every lock also has "notice": the "what to notice" text shown on screen.
//
// The engine (engine.js) runs these steps; this file only describes them.
// The steps are a simplified model of the C++ locks in src/locks/, chosen so
// that every shared read or write is its own step.

// The critical section is the same for every lock: the counter increment,
// split into read, add and write so that a lost update can be seen.
export const CS_STEPS = [
  {
    code: "tmp = counter",
    run: (ctx) => {
      ctx.local.tmp = ctx.get("counter");
      return { explain: "reads counter = " + ctx.local.tmp + " into its private tmp." };
    },
  },
  {
    code: "tmp = tmp + 1",
    run: (ctx) => {
      ctx.local.tmp = ctx.local.tmp + 1;
      return { explain: "adds one: its private tmp is now " + ctx.local.tmp + "." };
    },
  },
  {
    code: "counter = tmp",
    run: (ctx) => {
      ctx.set("counter", ctx.local.tmp);
      return { explain: "writes tmp back: counter = " + ctx.local.tmp + "." };
    },
  },
];

// ---------------------------------------------------------------------------
// NoLock: does nothing, so threads can be in the critical section together.
// ---------------------------------------------------------------------------
const noLock = {
  name: "none",
  title: "NoLock",
  broken: true,
  minThreads: 2,
  maxThreads: 4,
  notice: "Several threads walk into the critical section together. Watch two threads read the same " +
    "counter value into tmp: both write back the same number, so one increment is lost.",
  init: () => ({}),
  lock: [
    {
      code: "lock():  do nothing",
      run: () => ({ explain: "calls lock(), which does nothing, and walks straight in." }),
    },
  ],
  unlock: [
    {
      code: "unlock():  do nothing",
      run: () => ({ explain: "calls unlock(), which does nothing." }),
    },
  ],
};

// ---------------------------------------------------------------------------
// TasSpinLock: exchange(locked, true) until the old value was false.
// ---------------------------------------------------------------------------
const tasLock = {
  name: "tas",
  title: "TasSpinLock",
  minThreads: 2,
  maxThreads: 4,
  notice: "Every waiting step is a write (the exchange), even when the lock is taken. When the lock is " +
    "released, whichever thread happens to step next gets it: there is no queue, so a thread can lose many times in a row.",
  init: () => ({ locked: false }),
  lock: [
    {
      code: "while (exchange(locked, true) == true)  spin",
      run: (ctx) => {
        const old = ctx.get("locked");
        ctx.set("locked", true);
        if (old) {
          return {
            spin: true,
            explain: "swaps true into locked and gets back true: someone holds the lock, so it spins.",
          };
        }
        return { explain: "swaps true into locked and gets back false: the lock was free and is now its own." };
      },
    },
  ],
  unlock: [
    {
      code: "locked = false",
      run: (ctx) => {
        ctx.set("locked", false);
        return { explain: "sets locked = false, releasing the lock." };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// TicketLock: take a ticket, wait until now_serving shows it.
// ---------------------------------------------------------------------------
const ticketLock = {
  name: "ticket",
  title: "TicketLock",
  minThreads: 2,
  maxThreads: 4,
  notice: "Threads enter strictly in ticket order: compare my_ticket with now_serving. First come, first " +
    "served, so it is fair; but if the thread holding the next ticket does not run, nobody else can enter.",
  init: () => ({ next_ticket: 0, now_serving: 0 }),
  lock: [
    {
      code: "my_ticket = fetch_add(next_ticket, 1)",
      run: (ctx) => {
        const ticket = ctx.get("next_ticket");
        ctx.set("next_ticket", ticket + 1);
        ctx.local.my_ticket = ticket;
        return { explain: "takes ticket " + ticket + " (next_ticket is now " + (ticket + 1) + ")." };
      },
    },
    {
      code: "while (now_serving != my_ticket)  spin",
      run: (ctx) => {
        const serving = ctx.get("now_serving");
        if (serving !== ctx.local.my_ticket) {
          return {
            spin: true,
            explain: "sees now_serving = " + serving + ", but its ticket is " + ctx.local.my_ticket + ", so it waits.",
          };
        }
        return { explain: "sees now_serving = " + serving + ", its own ticket, and enters." };
      },
    },
  ],
  unlock: [
    {
      code: "now_serving = now_serving + 1",
      run: (ctx) => {
        const next = ctx.get("now_serving") + 1;
        ctx.set("now_serving", next);
        return { explain: "sets now_serving = " + next + ", calling the next ticket." };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// PetersonLock (2 threads, sequentially consistent). The while condition is
// split into its two reads, because they really are two separate loads.
// ---------------------------------------------------------------------------
const petersonLock = {
  name: "peterson",
  title: "PetersonLock",
  minThreads: 2,
  maxThreads: 2,
  notice: "When both threads want in, turn decides: the thread that wrote turn LAST waits, because it gave " +
    "the turn away. Only loads and stores are used, and it works for exactly two threads.",
  init: () => ({ flag: [false, false], turn: 0 }),
  lock: [
    {
      code: "flag[me] = true",
      run: (ctx) => {
        ctx.setAt("flag", ctx.me, true);
        return { explain: "sets flag[" + ctx.me + "] = true: it wants to enter." };
      },
    },
    {
      code: "turn = other",
      run: (ctx) => {
        ctx.set("turn", ctx.other);
        return { explain: "sets turn = " + ctx.other + ": politely lets the other thread go first." };
      },
    },
    {
      label: "check_flag",
      code: "while (flag[other] == true",
      run: (ctx) => {
        if (!ctx.getAt("flag", ctx.other)) {
          return {
            goto: "cs",
            explain: "reads flag[" + ctx.other + "] = false: the other thread is not interested, so it enters.",
          };
        }
        return { explain: "reads flag[" + ctx.other + "] = true: the other thread wants in too, so it checks turn." };
      },
    },
    {
      code: "       && turn == other)  spin",
      run: (ctx) => {
        const turn = ctx.get("turn");
        if (turn !== ctx.other) {
          return { goto: "cs", explain: "reads turn = " + turn + ": it is its own turn, so it enters." };
        }
        return {
          goto: "check_flag",
          explain: "reads turn = " + turn + ": it is the other thread's turn, so it spins.",
        };
      },
    },
  ],
  unlock: [
    {
      code: "flag[me] = false",
      run: (ctx) => {
        ctx.setAt("flag", ctx.me, false);
        return { explain: "sets flag[" + ctx.me + "] = false: it no longer wants to be inside." };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// TtasSpinLock: read until the lock looks free, then try the exchange.
// ---------------------------------------------------------------------------
const ttasLock = {
  name: "ttas",
  title: "TtasSpinLock",
  minThreads: 2,
  maxThreads: 4,
  notice: "Waiting threads only READ locked on line 1. When it looks free, several threads can see that " +
    "at once and all try the exchange on line 2; only one gets back false, the others go back to reading.",
  init: () => ({ locked: false }),
  lock: [
    {
      label: "test",
      code: "while (locked == true)  spin",
      run: (ctx) => {
        if (ctx.get("locked")) {
          return { spin: true, explain: "reads locked = true: the lock is taken, so it keeps reading." };
        }
        return { explain: "reads locked = false: the lock looks free, so it tries to take it." };
      },
    },
    {
      code: "if (exchange(locked, true) == true)  go back to line 1",
      run: (ctx) => {
        const old = ctx.get("locked");
        ctx.set("locked", true);
        if (old) {
          return {
            goto: "test",
            explain: "swaps true into locked but gets back true: another thread was faster, so it goes back to reading.",
          };
        }
        return { explain: "swaps true into locked and gets back false: the lock is its own." };
      },
    },
  ],
  unlock: [
    {
      code: "locked = false",
      run: (ctx) => {
        ctx.set("locked", false);
        return { explain: "sets locked = false, releasing the lock." };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// BakeryLock (Lamport): take a number one higher than every number seen,
// then wait for every thread with a smaller (number, id).
// Finding the maximum reads one number per step, as the real loop does.
// ---------------------------------------------------------------------------
const bakeryLock = {
  name: "bakery",
  title: "BakeryLock",
  minThreads: 2,
  maxThreads: 4,
  notice: "Two threads choosing at the same time can get the SAME number; the tie is broken by thread id " +
    "(lower id first). choosing[j] makes a thread wait until j has finished picking, so it never compares " +
    "against a half-chosen number.",
  init: (n) => ({ choosing: new Array(n).fill(false), number: new Array(n).fill(0) }),
  lock: [
    {
      code: "choosing[me] = true",
      run: (ctx) => {
        ctx.setAt("choosing", ctx.me, true);
        ctx.local.j = 0;
        ctx.local.max = 0;
        return { explain: "sets choosing[" + ctx.me + "] = true: it is picking a number." };
      },
    },
    {
      code: "for j in 0..N-1:  max = max(max, number[j])",
      run: (ctx) => {
        const j = ctx.local.j;
        const nj = ctx.getAt("number", j);
        ctx.local.max = Math.max(ctx.local.max, nj);
        ctx.local.j = j + 1;
        if (ctx.local.j < ctx.n) {
          return { spin: true, explain: "reads number[" + j + "] = " + nj + " (largest so far: " + ctx.local.max + ")." };
        }
        return { explain: "reads number[" + j + "] = " + nj + "; the largest number is " + ctx.local.max + "." };
      },
    },
    {
      code: "number[me] = max + 1",
      run: (ctx) => {
        ctx.setAt("number", ctx.me, ctx.local.max + 1);
        return { explain: "takes number " + (ctx.local.max + 1) + "." };
      },
    },
    {
      code: "choosing[me] = false",
      run: (ctx) => {
        ctx.setAt("choosing", ctx.me, false);
        ctx.local.j = 0;
        return { explain: "sets choosing[" + ctx.me + "] = false: it has its number." };
      },
    },
    {
      label: "wait_choosing",
      code: "for j in 0..N-1:  while (choosing[j])  spin",
      run: (ctx) => {
        const j = ctx.local.j;
        if (j >= ctx.n) {
          return { goto: "cs", explain: "has checked every thread and none is ahead of it, so it enters." };
        }
        if (j === ctx.me) {
          ctx.local.j = j + 1;
          return { spin: true, explain: "skips itself (j = " + j + ")." };
        }
        if (ctx.getAt("choosing", j)) {
          return { spin: true, explain: "sees choosing[" + j + "] = true: thread " + j + " is still picking, so it waits." };
        }
        return { explain: "sees choosing[" + j + "] = false: thread " + j + " has its number." };
      },
    },
    {
      code: "  while (number[j] != 0 && (number[j], j) < (number[me], me))  spin",
      run: (ctx) => {
        const j = ctx.local.j;
        const nj = ctx.getAt("number", j);
        const mine = ctx.getAt("number", ctx.me);
        const ahead = nj !== 0 && (nj < mine || (nj === mine && j < ctx.me));
        if (ahead) {
          return {
            spin: true,
            explain: "sees (number[" + j + "], " + j + ") = (" + nj + ", " + j + ") is smaller than its own (" +
              mine + ", " + ctx.me + "): thread " + j + " goes first, so it waits.",
          };
        }
        ctx.local.j = j + 1;
        return {
          goto: "wait_choosing",
          explain: nj === 0
            ? "sees number[" + j + "] = 0: thread " + j + " is not waiting, so it moves on."
            : "sees (" + nj + ", " + j + ") comes after its own (" + mine + ", " + ctx.me + "), so it moves on.",
        };
      },
    },
  ],
  unlock: [
    {
      code: "number[me] = 0",
      run: (ctx) => {
        ctx.setAt("number", ctx.me, 0);
        return { explain: "sets number[" + ctx.me + "] = 0: it is no longer waiting or inside." };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// SemaphoreLock: a counter (value) and a queue of sleeping threads. sem_wait
// and sem_post are each one step, because the kernel makes them atomic.
// ---------------------------------------------------------------------------
const semaphoreLock = {
  name: "semaphore",
  title: "SemaphoreLock",
  minThreads: 2,
  maxThreads: 4,
  sleeps: true,   // waiting threads sleep (the page shows a "sleeping" lane)
  notice: "A thread that finds value = 0 goes to SLEEP: it joins the queue and leaves the runnable list, " +
    "so the scheduler cannot pick it and it uses no CPU. sem_post adds one to value and wakes the first " +
    "sleeper, which then tries sem_wait again.",
  init: () => ({ value: 1, queue: [] }),
  lock: [
    {
      code: "sem_wait:  if (value > 0) value = value - 1;  else sleep in queue",
      run: (ctx) => {
        const value = ctx.get("value");
        if (value > 0) {
          ctx.set("value", value - 1);
          return { explain: "sees value = " + value + ", sets it to " + (value - 1) + " and enters." };
        }
        ctx.set("queue", ctx.get("queue").concat([ctx.me]));
        return { sleep: true, explain: "sees value = 0, joins the queue and goes to sleep." };
      },
    },
  ],
  unlock: [
    {
      code: "sem_post:  value = value + 1;  wake the first sleeper",
      run: (ctx) => {
        const value = ctx.get("value") + 1;
        ctx.set("value", value);
        const queue = ctx.get("queue");
        if (queue.length > 0) {
          const first = queue[0];
          ctx.set("queue", queue.slice(1));
          ctx.wake(first);
          return { explain: "sets value = " + value + " and wakes thread " + first + " from the queue." };
        }
        return { explain: "sets value = " + value + "; nobody is asleep." };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// MutexLock (std::mutex, a futex on Linux): a locked flag, an owner and a
// queue of sleeping threads. Each operation is one step.
// ---------------------------------------------------------------------------
const mutexLock = {
  name: "mutex",
  title: "MutexLock",
  minThreads: 2,
  maxThreads: 4,
  sleeps: true,
  notice: "Like the semaphore, waiters sleep instead of spinning. The mutex also has an owner: only the " +
    "thread that locked it unlocks it. A woken thread has to try again, and another thread may take the " +
    "mutex first, so it can go back to sleep.",
  init: () => ({ locked: false, owner: "none", waiters: [] }),
  lock: [
    {
      code: "lock:  if (!locked) { locked = true; owner = me }  else sleep in waiters",
      run: (ctx) => {
        if (!ctx.get("locked")) {
          ctx.set("locked", true);
          ctx.set("owner", "T" + ctx.me);
          return { explain: "finds the mutex unlocked, locks it and becomes the owner." };
        }
        ctx.set("waiters", ctx.get("waiters").concat([ctx.me]));
        return { sleep: true, explain: "finds the mutex locked by " + ctx.get("owner") + ", joins the waiters and sleeps." };
      },
    },
  ],
  unlock: [
    {
      code: "unlock:  locked = false; owner = none;  wake one waiter",
      run: (ctx) => {
        ctx.set("locked", false);
        ctx.set("owner", "none");
        const waiters = ctx.get("waiters");
        if (waiters.length > 0) {
          const first = waiters[0];
          ctx.set("waiters", waiters.slice(1));
          ctx.wake(first);
          return { explain: "unlocks the mutex and wakes thread " + first + ", which will try again." };
        }
        return { explain: "unlocks the mutex; nobody is waiting." };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// atomic: no lock at all. The whole increment is one fetch_add step, so it
// replaces the usual three-step critical section.
// ---------------------------------------------------------------------------
const atomicCounter = {
  name: "atomic",
  title: "atomic (no lock)",
  minThreads: 2,
  maxThreads: 4,
  notice: "There is no lock: read, add and write happen in ONE indivisible fetch_add step, so no update can " +
    "be lost and nobody ever waits. This only works for a single counter, not for a longer critical section.",
  init: () => ({}),
  lock: [],
  cs: [
    {
      code: "fetch_add(counter, 1)",
      run: (ctx) => {
        const old = ctx.get("counter");
        ctx.set("counter", old + 1);
        return { explain: "atomically reads " + old + " and writes " + (old + 1) + " in one step." };
      },
    },
  ],
  unlock: [],
};

// All simulated locks, in the order the selector shows them.
export const LOCK_PROGRAMS = {
  none: noLock,
  mutex: mutexLock,
  semaphore: semaphoreLock,
  tas: tasLock,
  ttas: ttasLock,
  ticket: ticketLock,
  peterson: petersonLock,
  bakery: bakeryLock,
  atomic: atomicCounter,
};
