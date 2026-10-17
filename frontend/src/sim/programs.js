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
//          and returns { explain, goto, spin }:
//            explain  one plain-English sentence for the event log
//            goto     (optional) label of the next step; default: the next line
//            spin     (optional) true = stay on this same step (busy wait)
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

// All simulated locks, in the order the selector shows them.
export const LOCK_PROGRAMS = {
  none: noLock,
  tas: tasLock,
  ticket: ticketLock,
  peterson: petersonLock,
};
