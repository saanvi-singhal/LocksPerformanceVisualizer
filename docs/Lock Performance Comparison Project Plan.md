# Lock Performance Comparison: Project Plan

Oct 16, 2026 · @Bibek Tripathy

## Overview

We will build a benchmark that compares mutual-exclusion locks (Peterson, Bakery, spinlocks, ticket lock, semaphore, mutex) on correctness, speed and fairness as the thread count grows. It covers Module 4 of BCSE303L, Concurrency.

The deliverables are one C++ program, one script that runs every experiment, a set of graphs, and a report that explains why each graph looks the way it does.

| Module 4 topic | Where it appears in the project |
| --- | --- |
| Peterson's solution | PetersonLock, 2 threads only |
| Bakery algorithm | BakeryLock, N threads |
| Synchronization hardware | Test-and-set spinlock, atomic fetch-add inside the ticket lock |
| Semaphores | SemaphoreLock |
| Scalable locks | Ticket lock, TTAS spinlock, thread-scaling graphs |
| Lock-free coordination | Atomic counter used as a no-lock reference |

## Tech stack

Use C++17 on Linux with CMake, and Python only for the graphs. Library features such as std::thread and std::atomic are fine and keep the code short enough to explain in the viva.

| Area | Choice | Why |
| --- | --- | --- |
| Language | C++17 | Threads and atomics are built in, and the syntax stays readable |
| OS and compiler | Linux, g++ 11 or newer (or clang) | Needed for thread pinning and perf; Windows users can use WSL2 |
| Threads | std::thread | Thin wrapper over pthreads, easy to explain |
| Atomics | std::atomic with explicit memory\_order | Peterson and Bakery are only correct on real CPUs with sequentially consistent ordering |
| Baseline lock | std::mutex | Pthread mutex underneath, what real programs use |
| Semaphore | POSIX sem\_t | Matches the syllabus semaphore topic directly |
| Timing | std::chrono::steady\_clock | Monotonic, unaffected by system clock changes |
| Thread pinning | pthread\_setaffinity\_np, behind a flag | Reduces noise in timings |
| Build | CMake, Release build with -O2 | One command to build; a separate ThreadSanitizer build for checks |
| Race checking | ThreadSanitizer (-fsanitize=thread) | Shows the unlocked version has real data races |
| Profiling (optional) | perf stat | Explains slowdowns through context switches and cache misses |
| Results and graphs | CSV, then Python 3 with pandas and matplotlib | Easy to re-run, diff and plot |
| Version control | Git, private GitHub repo, one branch per person | Merge through pull requests so each person reviews the other's code |

One design rule: every lock exposes lock(thread id) and unlock(thread id), because Peterson and Bakery must know which thread is calling. With that, every lock plugs into the same benchmark loop.

## Locks and experiments

We compare nine variants, run six experiments, and call the project done when every lock passes the correctness check and one script reproduces all the graphs.

| Lock | Threads | Role in the study |
| --- | --- | --- |
| NoLock | any | Deliberately broken; proves locks are needed because the final count is wrong |
| Peterson | 2 only | Software-only mutual exclusion, and the memory-ordering demo |
| Bakery | N | Software-only for N threads; shows the cost of scanning every thread |
| TAS spinlock | N | Simplest hardware-based lock (atomic exchange) |
| TTAS spinlock | N | Spins on a plain read first, so less cache traffic than TAS |
| Ticket lock | N | FIFO order, so it is the fairness reference |
| Semaphore lock | N | Binary semaphore used as a lock; sleeps instead of spinning |
| std::mutex | N | Baseline everything is compared against |
| Atomic counter | N | No lock at all; the lock-free reference |

Experiments:

1. **Correctness:** each thread increments a shared counter M times; the final value must equal threads × M, checked over 5 runs.
2. **Throughput:** total time and lock acquisitions per second at 1, 2, 4, 8 and 16 threads.
3. **Fairness:** acquisitions per thread, reported as the ratio of the busiest to the least busy thread.
4. **Critical-section length:** repeat with an empty, a short and a long busy loop inside the lock.
5. **Oversubscription:** run with twice as many threads as CPU cores to see spinlocks and blocking locks diverge.
6. **Memory-ordering demo:** Peterson with relaxed ordering fails on a real CPU; with sequentially consistent ordering it passes.

Report the median of 5 runs for every point so one noisy run does not distort a graph.

## Repository structure

The repo is split by file so that Person A and Person B rarely edit the same file, which avoids merge conflicts.

| Path | What lives there | Owner |
| --- | --- | --- |
| src/locks/lock.h | The common Lock interface; agreed together on day 1, then frozen | Both |
| src/locks/ (Peterson, Bakery) | One header per lock | A |
| src/locks/ (TAS, TTAS, ticket, semaphore) | One header per lock | B |
| src/locks/ (NoLock, MutexLock) | Scaffolded by Claude Code, reviewed by B | B |
| src/bench/main.cpp | Benchmark harness: options, thread launch, timing, correctness check | A |
| src/bench/metrics | Fairness calculation and CSV output | B |
| tests/ | Correctness script and ThreadSanitizer checks | A |
| scripts/ | run\_all.sh (all experiments) and plot.py (graphs) | B |
| results/ | Raw CSV and generated graphs | B |
| docs/ | Report, slides and this plan | Both |

## Work split

Person A owns correctness and the harness; Person B owns performance measurement and analysis. Each person finishes their own locks, then reviews the other's.

|  | Person A: correctness and harness | Person B: performance and analysis |
| --- | --- | --- |
| Locks | Peterson, Bakery | TAS, TTAS, ticket, semaphore; reviews mutex and NoLock |
| Harness | Options, thread launch, timing, correctness check, critical-section workloads | Fairness metric and CSV output |
| Testing | Correctness script, ThreadSanitizer build, memory-ordering demo | Oversubscription and optional perf stat runs |
| Scripts | None | run\_all.sh and plot.py |
| Report | Introduction, background, Peterson and Bakery, correctness testing | Spinlock, ticket and semaphore designs, results and analysis |

**Done together:**

- Agree the Lock interface on day 1, then do not change it without telling each other.
- Review each other's locks before merging, so both of you can answer viva questions on all of them.
- Write the conclusion, build the slides and rehearse the viva.

## Timeline

The plan assumes four weeks; shift the weeks if your deadline differs.

&#91;embedded content: 4-week plan by person, 4 gates\]

Each week ends at a gate, and the week 3 gate, when every graph can be regenerated with one script, is the one to protect.

## Report and viva prep

The report should lead with the race-condition demo and end with a reason for every graph shape.

1. Introduction: the shared-counter race and why locks exist
2. Background: critical section and the three requirements (mutual exclusion, progress, bounded waiting)
3. Lock designs: one short subsection per lock
4. Experimental setup: CPU model, core count, OS, compiler flags, number of runs
5. Results: the graphs
6. Analysis: why each lock behaves as it does
7. Conclusion and references (Silberschatz, Operating System Concepts, 10th edition)

Likely viva questions:

| Question | One-line answer |
| --- | --- |
| Why does the unlocked counter give the wrong total? | Increment is read, add, write back; two threads can read the same value and one update is lost |
| What must a correct lock provide? | Mutual exclusion, progress and bounded waiting |
| Why does Peterson work for only 2 threads? | It uses one flag per thread and a single turn variable, built for exactly two contenders; Bakery generalizes to N |
| Why does Peterson need sequentially consistent ordering? | A CPU can delay a store past a later load, so both threads may see the other's flag as false and enter together |
| Why is Bakery slow? | Every acquisition scans all N threads' tickets, so the cost grows with thread count |
| Why does TTAS beat TAS? | TAS writes to the shared cache line on every spin; TTAS spins on a read and writes only when the lock looks free |
| What does the ticket lock guarantee that TAS does not? | FIFO order, so no thread starves |
| Why can a mutex beat a spinlock when threads exceed cores? | A spinning thread wastes its time slice while the lock holder may not be running; a mutex puts the waiter to sleep |
| Which syllabus topic is the atomic counter? | Lock-free coordination |

## Claude Code setup prompt

Run Claude Code in an empty folder and paste the prompt below. It builds the skeleton and the two baseline locks only; each of you then implements your own locks.

```
Set up a C++17 project called lock-bench in the current folder. It is a university Operating Systems course project (VIT BCSE303L, Module 4) that benchmarks mutual-exclusion locks. Two students will work on it in parallel and both must be able to explain every line in a viva, so keep all code simple, readable and well commented. No template tricks, no macros, no clever one-liners.

Environment: Linux, g++ 11 or newer, CMake 3.16 or newer, Python 3 with pandas and matplotlib.

Do this:

1. Folder layout
   - src/locks/ : one header per lock
   - src/bench/ : main.cpp (the harness) and metrics.h / metrics.cpp (fairness and CSV output)
   - tests/ : correctness test script
   - scripts/ : run_all.sh and plot.py
   - results/ : output folder (keep the folder in git with a .gitkeep, ignore its contents)
   - docs/ : empty for now, with a .gitkeep

2. Common lock interface in src/locks/lock.h
   An abstract class Lock with: virtual void lock(int tid), virtual void unlock(int tid), and virtual const char* name(). Every lock takes the calling thread's id (0 to N-1) because Peterson and Bakery need it. The constructor takes the maximum number of threads.

3. Locks
   - Fully implement NoLock (does nothing, deliberately broken, used to demonstrate the race) and MutexLock (wraps std::mutex).
   - Create stubs that compile, each with a TODO comment and a short comment saying what the lock must do: PetersonLock (2 threads only), BakeryLock, TasSpinLock (test-and-set), TtasSpinLock (test-and-test-and-set), TicketLock, SemaphoreLock (POSIX sem_t). Until implemented, a stub behaves like NoLock but prints a loud warning on first use.

4. Benchmark harness in src/bench/main.cpp
   Command line options: --lock NAME, --threads N, --iters M, --cs empty|short|long, --runs R, --pin (optional thread pinning to cores with pthread_setaffinity_np).
   Each thread does M times: lock, increment one shared counter, run a busy loop whose length depends on --cs, unlock. Each thread also counts its own acquisitions in its own slot of a per-thread array (padded so slots do not share a cache line, with a comment explaining why).
   After joining the threads, check that the counter equals threads times M, measure total time with std::chrono::steady_clock, and print one CSV line per run with the columns: lock,threads,cs,run,total_ms,ops_per_sec,min_acq,max_acq,fairness_ratio,correct
   PetersonLock must refuse any thread count other than 2 with a clear error message.
   Also support a lock name 'atomic' that skips locking and uses std::atomic fetch_add on the counter, as the lock-free reference.
   Put the fairness and CSV formatting code in metrics.h / metrics.cpp so it can be owned separately from the harness.

5. Scripts
   - scripts/run_all.sh: sweep every lock, thread counts 1, 2, 4, 8, 16 plus twice the core count from nproc, all three cs lengths, 5 runs each, appending to results/raw.csv. Skip combinations a lock does not support.
   - scripts/plot.py: read results/raw.csv, take the median over runs, and save PNG graphs to results/graphs/: throughput versus threads, fairness ratio versus threads, and total time versus critical-section length, with one line per lock.
   - tests/check_correctness.sh: run every implemented lock with 4 threads and 100000 iterations and exit with a non-zero status if any run reports correct=false. NoLock is expected to fail, so print its result but exclude it from the pass condition.

6. Build
   CMakeLists.txt that builds one executable, lock_bench, with -O2 -Wall -Wextra and pthread linked. Add an option ENABLE_TSAN that builds with -fsanitize=thread.

7. Repo hygiene
   - .gitignore for build folders, results/raw.csv, results/graphs and Python cache files.
   - README with build, run and plot instructions, plus a file ownership section: Person A owns lock.h, PetersonLock, BakeryLock, main.cpp and tests; Person B owns TasSpinLock, TtasSpinLock, TicketLock, SemaphoreLock, metrics, scripts and results; both own docs.
   - Run git init, commit the skeleton with the message 'Initial skeleton', then create branches person-a and person-b.

When finished, build in Release mode and run NoLock and MutexLock with 4 threads and 100000 iterations. Show that NoLock reports correct=false and MutexLock reports correct=true. Then give me a short list of every file you created. If anything is ambiguous, ask me before choosing.
```
