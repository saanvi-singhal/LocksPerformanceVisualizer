// locks.js
// Everything the dashboard knows about each lock: its display order, colour,
// marker shape, and a short description for the "The locks" section.
//
// Colours: the eight working locks use the same eight colours, in the same
// assignment, as scripts/plot.py, so the PNG graphs and the dashboard match.
// The palette was checked with a colour-blind validator in light and dark
// mode. The two deliberately broken locks share a neutral grey, use dashed
// lines and are labelled "(broken)", so they never look like a real lock.

// Light-mode and dark-mode colour for each lock.
export const LOCK_COLORS = {
  mutex:            { light: "#2a78d6", dark: "#3987e5" },
  peterson:         { light: "#eb6834", dark: "#d95926" },
  bakery:           { light: "#1baf7a", dark: "#199e70" },
  tas:              { light: "#eda100", dark: "#c98500" },
  ttas:             { light: "#e87ba4", dark: "#d55181" },
  ticket:           { light: "#008300", dark: "#008300" },
  semaphore:        { light: "#6250d6", dark: "#9085e9" },
  atomic:           { light: "#e34948", dark: "#e66767" },
  none:             { light: "#898781", dark: "#898781" },
  peterson_relaxed: { light: "#898781", dark: "#898781" },
};

// The order locks appear in legends and tables, grouped by kind.
export const LOCK_ORDER = [
  "mutex", "semaphore",
  "tas", "ttas", "ticket",
  "peterson", "bakery",
  "atomic",
  "peterson_relaxed", "none",
];

// Locks that are wrong on purpose (they show what goes wrong without a lock).
export const BROKEN_LOCKS = ["none", "peterson_relaxed"];

// Marker shape per lock, so a line can be told apart without its colour.
export const LOCK_MARKERS = {
  mutex: "circle",
  semaphore: "square",
  tas: "triangle",
  ttas: "triangleDown",
  ticket: "diamond",
  peterson: "cross",
  bakery: "star",
  atomic: "x",
  peterson_relaxed: "squareHollow",
  none: "circleHollow",
};

// Name shown in legends, tooltips and tables.
export function lockLabel(lock) {
  if (lock === "none") return "none (broken)";
  if (lock === "peterson_relaxed") return "peterson_relaxed (broken)";
  if (lock === "atomic") return "atomic (no lock)";
  return lock;
}

// Short descriptions for the "The locks" section.
export const LOCK_INFO = [
  {
    lock: "mutex",
    kind: "Sleeping lock",
    title: "MutexLock (std::mutex)",
    text: "Wraps std::mutex. On Linux this is a pthread mutex built on a futex: " +
      "a waiting thread is put to sleep by the kernel instead of spinning. The baseline.",
  },
  {
    lock: "semaphore",
    kind: "Sleeping lock",
    title: "SemaphoreLock (POSIX sem_t)",
    text: "A binary semaphore that starts at 1. sem_wait takes it (sleeping if it is 0, " +
      "retrying on EINTR) and sem_post gives it back and wakes one waiter.",
  },
  {
    lock: "tas",
    kind: "Hardware spinlock",
    title: "TasSpinLock (test-and-set)",
    text: "Spins on an atomic exchange(true) with acquire ordering; unlock stores false " +
      "with release ordering. Every spin is a write, so the cache line bounces between cores.",
  },
  {
    lock: "ttas",
    kind: "Hardware spinlock",
    title: "TtasSpinLock (test-and-test-and-set)",
    text: "Spins on a relaxed read until the lock looks free, and only then tries the " +
      "exchange. Waiters read their cached copy, so there is less traffic while the lock is held.",
  },
  {
    lock: "ticket",
    kind: "Hardware spinlock",
    title: "TicketLock (FIFO)",
    text: "Takes a ticket with fetch_add and spins until now_serving shows it. Threads enter " +
      "in arrival order, so it is fair, but it collapses when the next thread is not running.",
  },
  {
    lock: "peterson",
    kind: "Software lock",
    title: "PetersonLock (2 threads)",
    text: "Two flags and a turn variable, using only loads and stores with seq_cst ordering. " +
      "Works for exactly two threads.",
  },
  {
    lock: "bakery",
    kind: "Software lock",
    title: "BakeryLock (Lamport, N threads)",
    text: "Each thread takes a number one higher than the current maximum and waits for all " +
      "smaller numbers. Fair, but every acquisition scans all N threads.",
  },
  {
    lock: "atomic",
    kind: "Reference",
    title: "atomic (no lock)",
    text: "No lock at all: one std::atomic fetch_add per iteration. The lock-free " +
      "upper reference for throughput.",
  },
  {
    lock: "peterson_relaxed",
    kind: "Broken on purpose",
    title: "PetersonRelaxedLock",
    text: "Peterson with relaxed ordering. On x86 a store can wait in the store buffer while a " +
      "later load runs, so both threads can enter together. Shows why seq_cst is needed.",
  },
  {
    lock: "none",
    kind: "Broken on purpose",
    title: "NoLock",
    text: "Does nothing. Two threads read the same counter value and both write back value + 1, " +
      "so increments are lost. Shows why a lock is needed at all.",
  },
];
