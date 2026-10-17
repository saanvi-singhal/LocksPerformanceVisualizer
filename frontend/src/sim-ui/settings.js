// settings.js
// The simulator settings (lock, threads, iterations, scheduler, seed) and
// how they are stored in the URL hash, so a run can be replayed:
//   #/simulator?lock=ticket&threads=3&iters=2&mode=random&seed=7
// In manual mode the threads chosen by hand are added as steps=0,1,1,0,...
import { createSim, MANUAL, RANDOM, ROUND_ROBIN } from "../sim/engine.js";
import { LOCK_PROGRAMS } from "../sim/programs.js";

// Scheduler modes as they appear in the URL.
const MODE_TO_URL = { [MANUAL]: "manual", [ROUND_ROBIN]: "rr", [RANDOM]: "random" };
const URL_TO_MODE = { manual: MANUAL, rr: ROUND_ROBIN, random: RANDOM };

export const DEFAULT_SETTINGS = {
  lock: "none",
  threads: 2,
  iterations: 2,
  mode: RANDOM,
  seed: 1,
};

// A whole number from text, kept between low and high; fallback if not a number.
function clampInt(text, low, high, fallback) {
  const n = parseInt(text, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(high, Math.max(low, n));
}

// Makes the thread count valid for the lock (Peterson: exactly 2).
export function fixThreads(lockName, threads) {
  const lock = LOCK_PROGRAMS[lockName];
  return Math.min(lock.maxThreads, Math.max(lock.minThreads, threads));
}

// Settings from the URL parameters, with defaults for anything missing or wrong.
export function settingsFromParams(params) {
  const lock = LOCK_PROGRAMS[params.lock] ? params.lock : DEFAULT_SETTINGS.lock;
  return {
    lock: lock,
    threads: fixThreads(lock, clampInt(params.threads, 1, 8, DEFAULT_SETTINGS.threads)),
    iterations: clampInt(params.iters, 1, 5, DEFAULT_SETTINGS.iterations),
    mode: URL_TO_MODE[params.mode] || DEFAULT_SETTINGS.mode,
    seed: clampInt(params.seed, 0, 999999, DEFAULT_SETTINGS.seed),
  };
}

// The hand-chosen thread order from the URL (manual mode), or null.
export function scriptFromParams(params) {
  if (!params.steps) return null;
  const steps = params.steps.split(",").map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
  return steps.length > 0 ? steps : null;
}

// A fresh simulation for these settings.
export function newSim(settings) {
  return createSim({
    lock: settings.lock,
    threads: settings.threads,
    iterations: settings.iterations,
    seed: settings.seed,
  });
}

// The URL hash that replays this run. In manual mode it also stores which
// thread was chosen at every step so far.
export function replayHash(settings, sim) {
  const params = new URLSearchParams();
  params.set("lock", settings.lock);
  params.set("threads", String(settings.threads));
  params.set("iters", String(settings.iterations));
  params.set("mode", MODE_TO_URL[settings.mode]);
  params.set("seed", String(settings.seed));
  if (settings.mode === MANUAL && sim.log.length > 0) {
    params.set("steps", sim.log.map((entry) => entry.thread).join(","));
  }
  return "#/simulator?" + params.toString();
}
