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
| `--lock NAME` | `none`, `mutex`, `peterson`, `bakery`, `tas`, `ttas`, `ticket`, `semaphore`, `atomic` | `mutex` |
| `--threads N` | number of threads (Peterson: exactly 2) | 4 |
| `--iters M` | lock acquisitions per thread; the run stops when the first thread reaches M | 100000 |
| `--cs LEN` | critical-section work: `empty`, `short`, `long` | `empty` |
| `--runs R` | repeat the run R times | 1 |
| `--pin` | pin thread i to core i mod cores | off |
| `--no-header` | do not print the CSV header line | off |

`atomic` uses no lock: it increments the counter with `std::atomic` `fetch_add`, as the lock-free reference.
`none` is deliberately broken and should report `correct=false`.

**Fairness window.** All threads stop as soon as the first thread has done its M iterations. Without this, every thread would always end with exactly M acquisitions and the fairness ratio would be 1.0 for every lock. A run is `correct=true` when the shared counter equals the sum of the per-thread acquisition counts (no lost updates) and at least one thread reached M. `ops_per_sec` is that sum divided by the measured time (start barrier to last join).

Output is one CSV line per run:

```
lock,threads,cs,run,total_ms,ops_per_sec,min_acq,max_acq,fairness_ratio,correct
```

`fairness_ratio` is the busiest thread's acquisitions divided by the least busy thread's, counted inside the fairness window (1.0 = perfectly fair). It is left empty if some thread never got the lock.

Locks that are not implemented yet behave like `none` and print a `NOT IMPLEMENTED` warning on stderr.

## Correctness test

```sh
tests/check_correctness.sh
```

Runs every implemented lock with 4 threads (Peterson: 2) and 100000 iterations, 5 runs each, and exits non-zero if any run is incorrect. NoLock's result is printed but not counted, and unimplemented stubs are reported as SKIP.

## All experiments and graphs

```sh
scripts/run_all.sh          # appends to results/raw.csv
python3 scripts/plot.py     # writes PNGs to results/graphs/
```

`run_all.sh` sweeps every lock over 1, 2, 4, 8, 16 and 2 x `nproc` threads, all three critical-section lengths, 5 runs each. Environment variables `ITERS`, `RUNS`, `PIN=1` and `BIN` change the defaults. Delete `results/raw.csv` first if you want a fresh data set.

`plot.py` takes the median over runs and writes:

- `throughput_vs_threads_<cs>.png`
- `fairness_vs_threads_<cs>.png`
- `time_vs_cs_<N>threads.png`

## Layout

```
src/locks/    one header per lock, plus lock.h (the common interface)
src/bench/    main.cpp (harness), metrics.h / metrics.cpp (fairness, CSV)
tests/        check_correctness.sh
scripts/      run_all.sh, plot.py
results/      raw.csv and graphs/ (generated, not in git)
docs/         plan, report, slides
```

## File ownership

| Person A | Person B | Both |
| --- | --- | --- |
| `src/locks/lock.h` | `src/locks/tas_spin_lock.h` | `docs/` |
| `src/locks/peterson_lock.h` | `src/locks/ttas_spin_lock.h` | |
| `src/locks/bakery_lock.h` | `src/locks/ticket_lock.h` | |
| `src/bench/main.cpp` | `src/locks/semaphore_lock.h` | |
| `tests/` | `src/bench/metrics.h`, `src/bench/metrics.cpp` | |
| | `scripts/` | |
| | `results/` | |

`lock.h` is agreed by both on day 1; do not change it without telling each other. Review each other's locks before merging so both of you can explain every one in the viva.
