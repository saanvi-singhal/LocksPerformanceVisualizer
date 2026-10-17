# lock-bench

Lock performance comparison: Peterson, Bakery, spinlocks, ticket lock, semaphore and mutex, measured under rising thread counts to show correctness, scalability and fairness.

VIT BCSE303L Operating Systems, Module 4 (Concurrency). The full plan is in `docs/`.

## Requirements

- Linux, g++ 11 or newer, CMake 3.16 or newer
- Python 3 with pandas and matplotlib (only for the graphs)

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
bash tests/run_tsan.sh      # ThreadSanitizer run (builds build-tsan/ if needed)
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

## Layout

```
src/locks/    one header per lock, plus lock.h (the common interface)
src/bench/    main.cpp (harness), metrics.h / metrics.cpp (fairness, CSV)
tests/        check_correctness.sh, run_tsan.sh
scripts/      run_all.sh, plot.py
results/      raw.csv and graphs/ (generated, not in git)
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

`lock.h` is agreed by both on day 1; do not change it without telling each other. Review each other's locks before merging so both of you can explain every one in the viva.
