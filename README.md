# lock-bench

Lock performance comparison: Peterson, Bakery, spinlocks, ticket lock, semaphore and mutex, measured under rising thread counts to show correctness, scalability and fairness.

 The full plan is in `docs/`.

## Requirements

- Linux, g++ 11 or newer, CMake 3.16 or newer
- Python 3 with pandas and matplotlib (only for the graphs)
- Node.js 20.19 or newer (or 22.12 or newer) with npm (only for the dashboard in `frontend/`)

## Build

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

ThreadSanitizer build (to show data races, for example with NoLock):

```sh
cmake -S . -B build-tsan -DENABLE_TSAN=ON
cmake --build build-tsan
./build-tsan/lock_bench --lock none --threads 4 --iters 1000
```

## Run

```sh
./build/lock_bench --lock mutex --threads 4 --iters 100000 --cs short --runs 5
```

| Option | Meaning | Default |
| --- | --- | --- |
| `--lock NAME` | `none`, `mutex`, `peterson`, `peterson_relaxed`, `bakery`, `tas`, `ttas`, `ticket`, `semaphore`, `atomic` | `mutex` |
| `--threads N` | number of threads (both Peterson variants: exactly 2) | 4 |
| `--iters M` | lock acquisitions per thread; the run stops when the first thread reaches M | 100000 |
| `--cs LEN` | critical-section work: `empty`, `short`, `long` | `empty` |
| `--runs R` | repeat the run R times | 1 |
| `--pin` | pin thread i to core i mod cores | off |
| `--no-header` | do not print the CSV header line | off |

`atomic` uses no lock: it increments the counter with `std::atomic` `fetch_add`, as the lock-free reference.
`none` is deliberately broken and should report `correct=false`.
`peterson_relaxed` is Peterson's algorithm with relaxed memory ordering; it is deliberately broken (the memory-ordering demo) and usually reports `correct=false`.

**Fairness window.** All threads stop as soon as the first thread has done its M iterations. Without this, every thread would always end with exactly M acquisitions and the fairness ratio would be 1.0 for every lock. A run is `correct=true` when the shared counter equals the sum of the per-thread acquisition counts (no lost updates) and at least one thread reached M. `ops_per_sec` is that sum divided by the measured time (start barrier to last join).

Output is one CSV line per run:

```
lock,threads,cs,run,total_ms,ops_per_sec,min_acq,max_acq,fairness_ratio,correct
```

`fairness_ratio` is the busiest thread's acquisitions divided by the least busy thread's, counted inside the fairness window (1.0 = perfectly fair). It is left empty if some thread never got the lock.

## Correctness test

```sh
tests/check_correctness.sh
tests/run_tsan.sh           # ThreadSanitizer run on every lock (builds build-tsan/ first)
```

`check_correctness.sh` runs every lock with 4 threads (Peterson variants: 2) and 100000 iterations, 5 runs each, and exits non-zero if any run is incorrect. The results of `none` and `peterson_relaxed` are printed as INFO but not counted, because they are expected to fail.

## All experiments and graphs

```sh
scripts/run_all.sh          # appends to results/raw.csv
python3 scripts/plot.py     # writes PNGs to results/graphs/
```

`run_all.sh` sweeps every lock over 1, 2, 4, 8, 16 and 2 x `nproc` threads, all three critical-section lengths, 5 runs each (Peterson variants only at 2 threads). Delete `results/raw.csv` first if you want a fresh data set. Environment variables change the defaults:

| Variable | Meaning | Default |
| --- | --- | --- |
| `ITERS` | iterations per thread | 100000 |
| `OVERSUB_ITERS` | iterations per thread at 2 x `nproc` threads | 1000 |
| `RUNS` | runs per combination | 5 |
| `TIMEOUT` | seconds allowed per combination; a timeout is reported and skipped | 120 |
| `PIN=1` | pin threads to cores | off |
| `BIN` | path to `lock_bench` | `build/lock_bench` |

The oversubscribed point (2 x `nproc` threads) uses fewer iterations because ticket and bakery slow down to a few thousand operations per second there: the thread whose turn is next is often not running, and everybody else has to wait for it. `ops_per_sec` is a rate, so it is still comparable with the other points.

For a quick check that everything works: `ITERS=20000 RUNS=3 scripts/run_all.sh`.

`plot.py` takes the median over runs and writes (log-scale y axes):

- `throughput_vs_threads_<cs>.png`: operations per second against thread count
- `fairness_vs_threads_<cs>.png`: fairness ratio against thread count (`none` and `peterson_relaxed` left out)
- `time_per_op_vs_cs_<N>threads.png`: average time per lock acquisition against critical-section length

Thread counts are compared with ops/s, not total time: every thread has the same iteration budget, so the total work grows with the thread count, and because of the fairness window an unfair lock also ends its run early.

## Demo

The dashboard in `frontend/` (Vite + React + Recharts) has two views, switched with the tabs at the top:

- **Results** (`#/results`): the **measured** benchmark results, read from `frontend/public/data/results.json`. That file is committed, so the dashboard works without re-running the benchmark.
- **Simulator** (`#/simulator`): a step-by-step **illustration** of each lock algorithm, plus a "Cores and oversubscription" mode (`#/simulator?view=cores`). Nothing in it is measured.

### Quick start: dashboard only, with the committed results

```sh
scripts/demo.sh
```

It installs the frontend dependencies the first time, starts the dashboard and prints the two URLs (Results and Simulator). Stop it with Ctrl+C.

### From a fresh clone to the dashboard

```sh
# 0. Get the code (the dev branch has everything)
git clone https://github.com/saanvi-singhal/LocksPerformanceVisualizer.git
cd LocksPerformanceVisualizer
git checkout dev

# 1. Build the C++ benchmark (Release, -O2 -Wall -Wextra) and check it
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
tests/check_correctness.sh        # every real lock must PASS
tests/run_tsan.sh                 # optional: ThreadSanitizer on every lock (a few minutes)

# 2. Run the sweep. Close other applications first (browser, IDE, video):
#    anything else using the CPU distorts the measurements.
#    On the 16-thread Ryzen 7 7435HS used here it took about 10 minutes;
#    expect longer on a machine with fewer cores.
rm -f results/raw.csv
scripts/run_all.sh

# 3. Make the PNG graphs and export the results for the dashboard
python3 scripts/plot.py           # writes results/graphs/*.png
python3 scripts/export_results.py # writes frontend/public/data/results.json

# 4. Start the dashboard: http://localhost:5173/
cd frontend
npm install
npm run dev
```

Production build instead of the development server: `npm run build` then `npm run preview` (http://localhost:4173/). Engine tests of the Simulator: `npm test`.

Re-run `scripts/export_results.py` after every new sweep, otherwise the dashboard still shows the old data. Also update `results/machine.txt` when the sweep runs on a different machine.

### Suggested demo order for the viva

1. **Simulator, NoLock race.** Simulator tab, lock "NoLock", scheduler "round robin", press Step: both threads walk into the critical section, the red banner appears, and two threads read the same counter value, so one increment is lost.
2. **Simulator, Peterson in manual mode.** Lock "PetersonLock", scheduler "manual": click Run T0, T0, T1, T1 (both set their flag and `turn`), then T0, T1, T0, T1. Both want in and both reach the `turn` check; `turn` is 0 because T1 wrote it last, so T0 enters and T1 spins: the thread that wrote `turn` last waits.
3. **Simulator, relaxed Peterson: store buffer vs sequentially consistent.** Lock "PetersonRelaxedLock", "Load the preset schedule", Auto-run: the stores wait in the store buffers, both threads read the other's flag as `false` and both enter. Tick "Sequentially consistent", load the preset again: now only one thread enters.
4. **Simulator, ticket vs semaphore on 4 cores.** "Cores and oversubscription", "Preset: ticket vs semaphore, 8 threads on 4 cores", Auto-run: spinning ticket threads fill the cores while the thread holding the lock waits for one; sleeping semaphore threads leave the cores free.
5. **The real benchmark in the terminal.** `./build/lock_bench --lock none --threads 4 --iters 100000` reports `correct=false` (lost increments); `./build/lock_bench --lock mutex --threads 4 --iters 100000` reports `correct=true`. Optionally `./build/lock_bench --lock peterson_relaxed --threads 2 --iters 100000 --runs 5`: the relaxed version fails on real x86 hardware too.
6. **Results: the measured graphs.** Throughput vs threads (and the collapse of ticket and bakery at 32\*), fairness (ticket and bakery near 1, TAS and TTAS unfair), then the oversubscription chart. Each lock card has "See how it works", and the Simulator has "See measured results", to jump between the two views.

## Measured vs simulated

| Measured (the real benchmark on one machine) | Simulated (illustration only) |
| --- | --- |
| `results/raw.csv`, `results/graphs/`, `results/machine.txt`, `results/sweep.txt` | Everything on the **Simulator** tab, both modes |
| `frontend/public/data/results.json` (exported from `raw.csv`) | `frontend/src/sim/` (the engine, the lock programs, its tests) |
| Everything on the **Results** tab: summary tiles, comparison sentence, correctness table, throughput, fairness, time per operation, oversubscription, machine details | Every number shown in the Simulator: counters, violations, "acquisitions per 100 rounds" |
| `tests/check_correctness.sh` and `tests/run_tsan.sh` output | The numbers printed by `npm test` (they describe the model, not the hardware) |

The Simulator labels every screen "Illustration of the algorithm, not measured data" (the cores mode: "Illustration: this is a simplified scheduler model, not measured data"), and the two views are only connected by links.

## Limitations

- **One machine.** All measurements come from one laptop (AMD Ryzen 7 7435HS, 8 cores / 16 threads, frequency boost on, no thread pinning). Other CPUs, especially ARM or with more sockets, can give different numbers; the oversubscribed point (32 threads) also uses fewer iterations (1000) than the others (100000).
- **Simplified scheduler model.** The Simulator's cores mode gives each running thread one step per round and rotates the cores every round. Real schedulers use time slices, so a thread that is next in line can be off its core for much longer: the measured collapse of the ticket and bakery locks is far larger than the model shows, and in the model TAS slows down about as much as the ticket lock.
- **Simplified store-buffer model.** The relaxed Peterson demo models x86 store buffering only: each thread's stores wait in its own buffer, oldest first, and the whole buffer is flushed in one step. Real CPUs drain the buffer on their own within nanoseconds, have caches, and other architectures (ARM, POWER) allow even more reordering.
- **Bakery differs from the textbook version.** `BakeryLock` pads each `choosing` and `number` entry to its own 64-byte cache line to avoid false sharing. This is an optimisation over Lamport's original; the algorithm is unchanged, but it measured 1.9x to 2.8x faster at 4 to 16 threads than the unpadded version.

## Layout

```
src/locks/    one header per lock, plus lock.h (the common interface)
src/bench/    main.cpp (harness), metrics.h / metrics.cpp (fairness, CSV)
tests/        check_correctness.sh, run_tsan.sh
scripts/      run_all.sh, plot.py, export_results.py, demo.sh
results/      machine.txt, sweep.txt (commit, date, iterations of the sweep); raw.csv and graphs/ (generated, not in git)
frontend/     dashboard (Vite + React): Results view (measured) and Simulator (src/sim/, illustration);
              public/data/results.json is generated but committed
docs/         plan, report, slides
```

## File ownership

| Person A | Person B | Both |
| --- | --- | --- |
| `src/locks/lock.h` | `src/locks/tas_spin_lock.h` | `docs/` |
| `src/locks/peterson_lock.h`, `peterson_relaxed_lock.h` | `src/locks/ttas_spin_lock.h` | |
| `src/locks/bakery_lock.h` | `src/locks/ticket_lock.h` | |
| `src/bench/main.cpp` | `src/locks/semaphore_lock.h` | |
| `tests/` | `src/bench/metrics.h`, `src/bench/metrics.cpp` | |
| | `scripts/` | |
| | `results/` | |
| | `frontend/` | |

`lock.h` is agreed by both on day 1; do not change it without telling each other. Review each other's locks before merging so both of you can explain every one in the viva.
